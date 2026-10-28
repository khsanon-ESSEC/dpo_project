/**
 * Suivi du pilote : ce qui dit si l'application est adoptée, en nombres agrégés seulement.
 * - rapports du vendredi envoyés, et envoyés à l'heure (heure limite du modèle de chacun) ;
 * - personnes qui ont mis à jour au moins une tâche entre le lundi et le vendredi ;
 * - écrans ouverts (personnes distinctes sur quatre semaines), pour voir ce qui ne sert pas.
 * Les écrans ouverts sont notés par jour et par personne (« a ouvert cet écran ce jour-là ») mais ne sont
 * jamais montrés par personne.
 */
import "server-only";
import { and, count, countDistinct, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui, dateLocale, lundiDe } from "@/lib/dates";
import { horairesDuRapport } from "@/lib/donnees/modeles";
import { chargerOrganisation } from "@/lib/organisation";
import { redigeUnRapport } from "@/lib/regles";

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

/** « AAAA-MM-JJ HHMM » à l'heure locale de la division, pour comparer un instant à une heure limite. */
function instantLocal(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${String(Number(p.hour) * 60 + Number(p.minute)).padStart(4, "0")}`;
}

/** Écrans connus du suivi du pilote, avec leur nom lisible. */
const L: Record<string, string> = {
    "/semaine": "Ma semaine",
    "/a-faire": "À faire",
    "/reunions": "Réunions",
    "/bilan": "Mon bilan",
    "/rapport": "Rapport du vendredi",
    "/rapports": "Mes rapports",
    "/rapports/[id]": "Un rapport envoyé",
    "/equipe": "Équipe · cette semaine",
    "/equipe/[id]": "Équipe · une personne",
    "/equipe/rapports": "Équipe · rapports",
    "/equipe/bilan": "Équipe · bilan",
    "/charge": "Charge de travail",
    "/projets": "Portefeuille des projets",
    "/projets/nouveau": "Proposer un projet",
    "/projets/[id]": "Projet · vue d'ensemble",
    "/projets/[id]/liste": "Projet · liste",
    "/projets/[id]/tableau": "Projet · tableau",
    "/projets/[id]/gantt": "Projet · Gantt",
    "/projets/[id]/calendrier": "Projet · calendrier",
    "/projets/[id]/charge": "Projet · charge",
    "/projets/[id]/modifier": "Projet · modifier",
    "/taches/[id]": "Une tâche",
    "/taches/nouvelle": "Nouvelle tâche (formulaire)",
    "/personnes/[id]": "Fiche d'une personne",
    "/recherche": "Rechercher",
    "/alertes": "Alertes",
    "/conseil": "Rapport au conseil",
    "/conseil/ponctuels": "Rapports ponctuels",
    "/organisation": "Organisation",
    "/organisation/importer": "Importer l'organisation",
    "/organisation/modeles": "Modèles de rapport",
    "/pilote": "Suivi du pilote",
    "/plus": "Plus (téléphone)",
    "/profil": "Profil",
};

/** Nom lisible d'un écran noté dans les consultations. */
export function libelleEcran(e: string): string {
  return L[e] ?? e;
}

export async function suiviPilote(semaines = 12) {
  const jour = aujourdhui();
  const org = await chargerOrganisation();
  // Rédacteurs : personnes actives de la division qui envoient un rapport (ni exécutifs, ni hors division).
  const redacteurs = [...org.personnes.values()].filter((p) => p.actif && redigeUnRapport(p)).map((p) => p.id);
  const courante = lundiDe(jour);
  const lundis = Array.from({ length: semaines }, (_, i) => ajouterJours(courante, -7 * (semaines - 1 - i)));

  const rapports = redacteurs.length
    ? await db
        .select({ auteurId: schema.rapportsHebdo.auteurId, semaine: schema.rapportsHebdo.semaine, statut: schema.rapportsHebdo.statut, envoyeLe: schema.rapportsHebdo.envoyeLe, versionModeleId: schema.rapportsHebdo.versionModeleId })
        .from(schema.rapportsHebdo)
        .where(and(inArray(schema.rapportsHebdo.auteurId, redacteurs), gte(schema.rapportsHebdo.semaine, lundis[0]), lte(schema.rapportsHebdo.semaine, courante)))
    : [];
  const debut = new Date(`${ajouterJours(lundis[0], -1)}T00:00:00Z`);
  const evenements = redacteurs.length
    ? await db
        .select({ auteurId: schema.evenementsTache.auteurId, creeLe: schema.evenementsTache.creeLe })
        .from(schema.evenementsTache)
        .where(and(inArray(schema.evenementsTache.auteurId, redacteurs), gte(schema.evenementsTache.creeLe, debut)))
    : [];

  // Personnes qui ont ouvert l'application chaque semaine (au moins un écran).
  const vues = await db
    .selectDistinct({ jour: schema.consultations.jour, personneId: schema.consultations.personneId })
    .from(schema.consultations)
    .where(gte(schema.consultations.jour, lundis[0]));

  const parSemaine = [];
  for (const l of lundis) {
    const vendredi = ajouterJours(l, 4);
    const attendu = vendredi <= jour; // le rapport d'une semaine est attendu à partir de son vendredi
    const envoyes = rapports.filter((r) => r.semaine === l && r.statut === "envoye" && r.envoyeLe);
    let aLheure = 0;
    for (const r of envoyes) {
      const h = await horairesDuRapport(r);
      const limite = h.limite ? `${ajouterJours(l, h.limite.jour - 1)} ${String(Number(h.limite.heure.slice(0, 2)) * 60 + Number(h.limite.heure.slice(3, 5))).padStart(4, "0")}` : `${ajouterJours(l, 7)} 0000`;
      if (instantLocal(r.envoyeLe!) <= limite) aLheure += 1;
    }
    const actifs = new Set(evenements.filter((e) => e.auteurId && dateLocale(e.creeLe) >= l && dateLocale(e.creeLe) <= vendredi).map((e) => e.auteurId));
    const ouvert = new Set(vues.filter((v) => v.jour >= l && v.jour <= ajouterJours(l, 6)).map((v) => v.personneId));
    parSemaine.push({ lundi: l, attendu, redacteurs: redacteurs.length, envoyes: envoyes.length, aLheure, tachesAJour: actifs.size, actifs: ouvert.size, enCours: l === courante && !attendu, courante: l === courante });
  }

  // Écrans : quatre dernières semaines.
  const depuis = ajouterJours(jour, -27);
  const ecrans = await db
    .select({ ecran: schema.consultations.ecran, personnes: countDistinct(schema.consultations.personneId), jours: count() })
    .from(schema.consultations)
    .where(gte(schema.consultations.jour, depuis))
    .groupBy(schema.consultations.ecran);
  const [{ n: actifs }] = await db.select({ n: countDistinct(schema.consultations.personneId) }).from(schema.consultations).where(gte(schema.consultations.jour, depuis));
  const utilisateurs = [...org.personnes.values()].filter((p) => p.actif && (!p.externe || p.acces)).length;

  return {
    semaines: parSemaine,
    ecrans: ecrans.map((e) => ({ ...e, libelle: libelleEcran(e.ecran) })).sort((x, y) => x.personnes - y.personnes || x.libelle.localeCompare(y.libelle, "fr")),
    actifs: Number(actifs),
    utilisateurs,
    depuis,
  };
}

/** Écran noté : le chemin sans paramètres, les identifiants remplacés par [id]. */
export function ecranDe(chemin: string): string | null {
  const c = String(chemin ?? "").split(/[?#]/)[0].replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/[id]").replace(/\/$/, "");
  // Seulement les écrans connus : rien d'inventé ne s'affiche dans le suivi du pilote.
  return Object.hasOwn(L, c) ? c : null;
}

export async function noterConsultation(personneId: string, chemin: string) {
  const ecran = ecranDe(chemin);
  if (!ecran) return;
  await db.insert(schema.consultations).values({ jour: aujourdhui(), ecran, personneId }).onConflictDoNothing();
}
