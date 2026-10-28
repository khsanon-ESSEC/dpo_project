/**
 * Tournée des rappels du vendredi par courriel (toutes les cinq minutes, lancée par instrumentation.ts).
 * Chaque envoi est d'abord réservé dans envois_courriel (une ligne par personne, type et semaine, clé unique) :
 * même avec plusieurs copies de l'application, un courriel ne part qu'une fois. Un envoi manqué (serveur de
 * courriel indisponible) est retenté vingt minutes plus tard, tant qu'il est encore dû.
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { maintenantLocal } from "@/lib/dates";
import { envoyerCourriel, type Expediteur } from "@/lib/courriel";
import { courrielDu, messageRappel } from "@/lib/courriel-regles";
import { formulairePour, horairesDuRapport } from "@/lib/donnees/modeles";
import { semaineCourante } from "@/lib/donnees/rapport";
import { etapeRapport, HORAIRES_PAR_DEFAUT } from "@/lib/modeles";
import { chargerOrganisation } from "@/lib/organisation";
import { redigeUnRapport } from "@/lib/regles";

const EN_COURS = "en cours";
const NOUVEL_ESSAI_MINUTES = 20;

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

  let envoyes = 0;
  let erreurs = 0;
  for (const p of redacteurs) {
    const rapport = rapports.get(p.id);
    if (rapport?.statut === "envoye") continue;
    const faits = deja.get(p.id) ?? new Set<string>();
    if (faits.has("rapport_rappel")) continue;
    const horaires = rapport ? await horairesDuRapport(rapport) : ((await formulairePour(p.id)).modele?.horaires ?? HORAIRES_PAR_DEFAUT);
    const etape = etapeRapport(horaires, semaine, maintenant);
    const type = courrielDu(etape, { rapportEnvoye: false, avecRappel: !!horaires.rappel, deja: faits, minutes: maintenant.minutes });
    if (!type) continue;

    // Réserver l'envoi : une nouvelle ligne, ou une ligne manquée depuis plus de vingt minutes.
    let [reserve] = await db
      .insert(schema.envoisCourriel)
      .values({ personneId: p.id, type, semaine, erreur: EN_COURS })
      .onConflictDoNothing()
      .returning({ id: schema.envoisCourriel.id });
    if (!reserve) {
      [reserve] = await db
        .update(schema.envoisCourriel)
        .set({ erreur: EN_COURS, envoyeLe: new Date() })
        .where(
          and(
            eq(schema.envoisCourriel.personneId, p.id),
            eq(schema.envoisCourriel.type, type),
            eq(schema.envoisCourriel.semaine, semaine),
            ne(schema.envoisCourriel.erreur, ""),
            sql`${schema.envoisCourriel.envoyeLe} < now() - make_interval(mins => ${NOUVEL_ESSAI_MINUTES})`,
          ),
        )
        .returning({ id: schema.envoisCourriel.id });
    }
    if (!reserve) continue;

    const m = messageRappel(type, { prenom: p.prenom, semaine, horaires, enRetard: etape === "en_retard", lien });
    try {
      await envoyer({ a: p.courriel!, ...m });
      await db.update(schema.envoisCourriel).set({ erreur: "", envoyeLe: new Date() }).where(eq(schema.envoisCourriel.id, reserve.id));
      envoyes += 1;
    } catch (e) {
      // Le message du serveur de courriel, sans l'adresse ni le contenu.
      const message = String((e as Error)?.message ?? e).replaceAll(p.courriel!, "<adresse>").slice(0, 300) || "échec";
      await db.update(schema.envoisCourriel).set({ erreur: message, envoyeLe: new Date() }).where(eq(schema.envoisCourriel.id, reserve.id));
      erreurs += 1;
    }
  }
  if (envoyes || erreurs) console.log(`courriel : ${envoyes} rappel(s) envoyé(s)${erreurs ? `, ${erreurs} en erreur` : ""}`);
  return { envoyes, erreurs };
}

/** Pour le suivi du pilote : courriels de la semaine, envoyés et en erreur (nombres seulement). */
export async function bilanCourriels(semaine: string) {
  const lignes = await db.select({ erreur: schema.envoisCourriel.erreur }).from(schema.envoisCourriel).where(eq(schema.envoisCourriel.semaine, semaine));
  return { envoyes: lignes.filter((l) => l.erreur === "").length, erreurs: lignes.filter((l) => l.erreur !== "" && l.erreur !== EN_COURS).length };
}
