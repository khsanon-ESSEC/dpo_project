/**
 * Tournée des rappels du vendredi par courriel (et du courriel du lundi, plus bas) (toutes les cinq minutes, lancée par instrumentation.ts).
 * Chaque envoi est d'abord réservé dans envois_courriel (une ligne par personne, type et semaine, clé unique) :
 * même avec plusieurs copies de l'application, un courriel ne part qu'une fois. Un envoi manqué (serveur de
 * courriel indisponible) est retenté vingt minutes plus tard, tant qu'il est encore dû.
 */
import "server-only";
import { and, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { joursOuvresAbsents } from "@/lib/absences";
import { ajouterJours, maintenantLocal } from "@/lib/dates";
import { envoyerCourriel, type Expediteur } from "@/lib/courriel";
import { courrielDu, estMomentDuLundi, messageLundi, messageRappel } from "@/lib/courriel-regles";
import { absencesDe, plages } from "@/lib/donnees/absences";
import { reunionsDe } from "@/lib/donnees/reunions";
import { formulairePour, horairesDuRapport } from "@/lib/donnees/modeles";
import { semaineCourante } from "@/lib/donnees/rapport";
import { etapeRapport, HORAIRES_PAR_DEFAUT } from "@/lib/modeles";
import { chargerOrganisation } from "@/lib/organisation";
import { redigeUnRapport } from "@/lib/regles";

const EN_COURS = "en cours";
const NOUVEL_ESSAI_MINUTES = 20;

/** Réserver l'envoi : une nouvelle ligne, ou une ligne manquée depuis plus de vingt minutes. null : déjà fait. */
async function reserver(personneId: string, type: string, semaine: string): Promise<string | null> {
  let [reserve] = await db.insert(schema.envoisCourriel).values({ personneId, type, semaine, erreur: EN_COURS }).onConflictDoNothing().returning({ id: schema.envoisCourriel.id });
  if (!reserve) {
    [reserve] = await db
      .update(schema.envoisCourriel)
      .set({ erreur: EN_COURS, envoyeLe: new Date() })
      .where(
        and(
          eq(schema.envoisCourriel.personneId, personneId),
          eq(schema.envoisCourriel.type, type),
          eq(schema.envoisCourriel.semaine, semaine),
          ne(schema.envoisCourriel.erreur, ""),
          sql`${schema.envoisCourriel.envoyeLe} < now() - make_interval(mins => ${NOUVEL_ESSAI_MINUTES})`,
        ),
      )
      .returning({ id: schema.envoisCourriel.id });
  }
  return reserve?.id ?? null;
}

/** Envoie, puis note la réussite ou l'erreur (le message du serveur, sans l'adresse ni le contenu). */
async function envoyerEtNoter(envoyer: Expediteur, reserve: string, adresse: string, m: { sujet: string; texte: string; html: string }): Promise<boolean> {
  try {
    await envoyer({ a: adresse, ...m });
    await db.update(schema.envoisCourriel).set({ erreur: "", envoyeLe: new Date() }).where(eq(schema.envoisCourriel.id, reserve));
    return true;
  } catch (e) {
    const message = String((e as Error)?.message ?? e).replaceAll(adresse, "<adresse>").slice(0, 300) || "échec";
    await db.update(schema.envoisCourriel).set({ erreur: message, envoyeLe: new Date() }).where(eq(schema.envoisCourriel.id, reserve));
    return false;
  }
}

export async function tourneeRappels(o: { envoyer?: Expediteur; maintenant?: { jour: string; minutes: number }; lien?: string } = {}) {
  const envoyer = o.envoyer ?? envoyerCourriel;
  const maintenant = o.maintenant ?? maintenantLocal();
  const lien = o.lien ?? `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/connexion?suite=/rapport`;
  const semaine = semaineCourante();
  const org = await chargerOrganisation();
  const redacteurs = [...org.personnes.values()].filter((p) => p.actif && redigeUnRapport(p) && /@/.test(p.courriel ?? ""));
  if (!redacteurs.length) return { envoyes: 0, erreurs: 0 };
  const ids = redacteurs.map((p) => p.id);

  const rapports = new Map(
    (
      await db
        .select({ auteurId: schema.rapportsHebdo.auteurId, statut: schema.rapportsHebdo.statut, versionModeleId: schema.rapportsHebdo.versionModeleId })
        .from(schema.rapportsHebdo)
        .where(and(eq(schema.rapportsHebdo.semaine, semaine), inArray(schema.rapportsHebdo.auteurId, ids)))
    ).map((r) => [r.auteurId, r]),
  );
  // Déjà fait (ou en cours, ou manqué il y a moins de vingt minutes) : pas de nouvel essai pour ce type.
  const limiteEssai = Date.now() - NOUVEL_ESSAI_MINUTES * 60_000;
  const deja = new Map<string, Set<string>>();
  for (const e of await db
    .select({ personneId: schema.envoisCourriel.personneId, type: schema.envoisCourriel.type, erreur: schema.envoisCourriel.erreur, envoyeLe: schema.envoisCourriel.envoyeLe })
    .from(schema.envoisCourriel)
    .where(and(eq(schema.envoisCourriel.semaine, semaine), inArray(schema.envoisCourriel.personneId, ids)))) {
    if (e.erreur === "" || e.envoyeLe.getTime() > limiteEssai) (deja.get(e.personneId) ?? deja.set(e.personneId, new Set()).get(e.personneId)!).add(e.type);
  }

  // Absent(e) aujourd'hui : pas de rappel (le rapport n'est pas attendu d'une semaine d'absence).
  const absents = await absencesDe(ids, maintenant.jour, maintenant.jour);

  let envoyes = 0;
  let erreurs = 0;
  for (const p of redacteurs) {
    const rapport = rapports.get(p.id);
    if (rapport?.statut === "envoye") continue;
    if (absents.has(p.id)) continue;
    const faits = deja.get(p.id) ?? new Set<string>();
    if (faits.has("rapport_rappel")) continue;
    const horaires = rapport ? await horairesDuRapport(rapport) : ((await formulairePour(p.id)).modele?.horaires ?? HORAIRES_PAR_DEFAUT);
    const etape = etapeRapport(horaires, semaine, maintenant);
    const type = courrielDu(etape, { rapportEnvoye: false, avecRappel: !!horaires.rappel, deja: faits, minutes: maintenant.minutes });
    if (!type) continue;

    const reserve = await reserver(p.id, type, semaine);
    if (!reserve) continue;

    const m = messageRappel(type, { prenom: p.prenom, semaine, horaires, enRetard: etape === "en_retard", lien });
    if (await envoyerEtNoter(envoyer, reserve, p.courriel!, m)) envoyes += 1;
    else erreurs += 1;
  }
  if (envoyes || erreurs) console.log(`courriel : ${envoyes} rappel(s) envoyé(s)${erreurs ? `, ${erreurs} en erreur` : ""}`);
  return { envoyes, erreurs };
}

/**
 * Courriel du lundi (29 octobre 2026), pour qui l'a demandé dans son profil : le lundi entre 7 h et midi, un seul
 * par semaine. Les tâches en retard, les échéances de la semaine et les réunions ; rien s'il n'y a rien à dire,
 * ni pour une personne absente toute la semaine. COURRIEL_LUNDI=nombres : sans les titres, seulement les nombres.
 */
export async function tourneeLundi(o: { envoyer?: Expediteur; maintenant?: { jour: string; minutes: number }; lien?: string } = {}) {
  const envoyer = o.envoyer ?? envoyerCourriel;
  const maintenant = o.maintenant ?? maintenantLocal();
  if (!estMomentDuLundi(maintenant)) return { envoyes: 0, erreurs: 0 };
  const lien = o.lien ?? `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/connexion?suite=/semaine`;
  const detail = (process.env.COURRIEL_LUNDI ?? "").trim().toLowerCase() === "nombres" ? "nombres" : "titres";
  const lundi = maintenant.jour;
  const dimanche = ajouterJours(lundi, 6);
  const inscrits = await db
    .select({ id: schema.personnes.id, prenom: schema.personnes.prenom, courriel: schema.personnes.courriel })
    .from(schema.personnes)
    .where(and(eq(schema.personnes.actif, true), eq(schema.personnes.courrielLundi, true)));
  const avecAdresse = inscrits.filter((p) => /@/.test(p.courriel ?? ""));
  if (!avecAdresse.length) return { envoyes: 0, erreurs: 0 };
  const ids = avecAdresse.map((p) => p.id);
  const [deja, absences, taches] = await Promise.all([
    db
      .select({ personneId: schema.envoisCourriel.personneId })
      .from(schema.envoisCourriel)
      .where(and(eq(schema.envoisCourriel.semaine, lundi), eq(schema.envoisCourriel.type, "lundi"), inArray(schema.envoisCourriel.personneId, ids), eq(schema.envoisCourriel.erreur, ""))),
    absencesDe(ids, lundi, ajouterJours(lundi, 4)),
    db
      .select({ assigneId: schema.taches.assigneId, titre: schema.taches.titre, echeance: schema.taches.echeance, code: schema.projets.code })
      .from(schema.taches)
      .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
      .where(and(inArray(schema.taches.assigneId, ids), ne(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe), isNotNull(schema.taches.echeance), lte(schema.taches.echeance, dimanche))),
  ]);
  const faits = new Set(deja.map((x) => x.personneId));
  let envoyes = 0;
  let erreurs = 0;
  for (const p of avecAdresse) {
    if (faits.has(p.id)) continue;
    if (joursOuvresAbsents(plages(absences.get(p.id)), lundi, ajouterJours(lundi, 4)) >= 5) continue;
    const siennes = taches.filter((t) => t.assigneId === p.id).sort((a, b) => a.echeance!.localeCompare(b.echeance!));
    const reunions = (await reunionsDe(p.id, lundi, dimanche)).map((r) => ({ titre: r.titre, jour: r.jour, heure: r.heure, code: r.projetCode }));
    const m = messageLundi({
      prenom: p.prenom,
      lundi,
      retards: siennes.filter((t) => t.echeance! < lundi).map((t) => ({ titre: t.titre, jour: t.echeance!, code: t.code })),
      echeances: siennes.filter((t) => t.echeance! >= lundi).map((t) => ({ titre: t.titre, jour: t.echeance!, code: t.code })),
      reunions,
      detail,
      lien,
    });
    if (!m) continue;
    const reserve = await reserver(p.id, "lundi", lundi);
    if (!reserve) continue;
    if (await envoyerEtNoter(envoyer, reserve, p.courriel!, m)) envoyes += 1;
    else erreurs += 1;
  }
  if (envoyes || erreurs) console.log(`courriel : ${envoyes} courriel(s) du lundi envoyé(s)${erreurs ? `, ${erreurs} en erreur` : ""}`);
  return { envoyes, erreurs };
}

/** Pour le suivi du pilote : courriels de la semaine, envoyés et en erreur (nombres seulement). */
export async function bilanCourriels(semaine: string) {
  const lignes = await db.select({ erreur: schema.envoisCourriel.erreur }).from(schema.envoisCourriel).where(eq(schema.envoisCourriel.semaine, semaine));
  return { envoyes: lignes.filter((l) => l.erreur === "").length, erreurs: lignes.filter((l) => l.erreur !== "" && l.erreur !== EN_COURS).length };
}
