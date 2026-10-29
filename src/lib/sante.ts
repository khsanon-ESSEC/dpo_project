/**
 * Santé d'un projet, calculée par l'application à partir de ses données (et non choisie par le chef de projet) :
 *
 * En retard, si l'une de ces conditions est vraie :
 *  - la fin prévue est dépassée (projet pas finalisé) ;
 *  - un livrable ni prêt ni validé a plus de JOURS_JALON_EN_RETARD jours de retard ;
 *  - au moins PART_TACHES_EN_RETARD des tâches ouvertes à échéance sont en retard (MIN_TACHES_EN_RETARD au moins).
 * À surveiller, si l'une de ces conditions est vraie :
 *  - la fin prévue a été repoussée dans les JOURS_REPORT_RECENT derniers jours ;
 *  - un livrable ni prêt ni validé a dépassé sa date ;
 *  - des tâches ouvertes d'un livrable sont prévues après la date de ce livrable ;
 *  - une tâche a plus de JOURS_TACHE_EN_RETARD jours de retard, ou une tâche est bloquée depuis plus de JOURS_BLOCAGE jours ;
 *  - au rythme des SEMAINES_RYTHME dernières semaines, les tâches ouvertes ne seront pas finies avant la fin prévue ;
 *  - un risque critique est ouvert au registre des risques, ou une phase a dépassé sa fin prévue sans être terminée ;
 *  - le chef de projet a signalé un risque (il ne peut qu'aggraver : jamais rendre un projet meilleur que le calcul),
 *    valable JOURS_SIGNAL jours.
 * Dans les temps, sinon. Le motif dit pourquoi, en clair. Règles pures, testées dans tests/sante.test.ts.
 */
import { ajouterJours, dateCourte, ecartJours } from "./dates";

export const SEUILS_SANTE = {
  JOURS_JALON_EN_RETARD: 30,
  PART_TACHES_EN_RETARD: 0.25,
  MIN_TACHES_EN_RETARD: 3,
  JOURS_TACHE_EN_RETARD: 7,
  JOURS_BLOCAGE: 7,
  JOURS_REPORT_RECENT: 30,
  SEMAINES_RYTHME: 4,
  JOURS_SIGNAL: 30,
} as const;

export type Sante = "dans_les_temps" | "a_surveiller" | "en_retard";

export type DonneesSante = {
  statut: string;
  dateFinPrevue: string | null;
  /** Livrables : « atteint » vaut aussi pour un livrable prêt à valider (le travail est fait). */
  livrables: { prevuLe: string | null; atteint: boolean; tachesApres?: number }[];
  /** Tâches non annulées du projet. */
  taches: { statut: string; echeance: string | null; creeLe: string; termineeLe: string | null; bloqueeDepuis: string | null }[];
  /** Reports de la fin prévue : le jour où ils ont été décidés. */
  reports: { le: string; avant: string | null; apres: string | null }[];
  /** Risque signalé par le chef de projet. */
  risque: { motif: string; le: string; par: string | null } | null;
  /** Risques critiques (probabilité × impact ≥ 6) encore ouverts au registre. */
  risquesCritiques?: number;
  /** Phases dont la fin prévue est passée sans qu'elles soient terminées. */
  phasesDepassees?: { nom: string; fin: string }[];
};

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/** Le risque signalé est-il encore valable aujourd'hui ? */
export function signalActif(risque: DonneesSante["risque"], jour: string): boolean {
  return !!risque && !!risque.motif && risque.le >= ajouterJours(jour, -SEUILS_SANTE.JOURS_SIGNAL);
}

export function calculerSante(d: DonneesSante, jour: string): { sante: Sante; raisons: string[] } {
  // Projets terminés, en demande ou refusés : pas de santé à suivre.
  if (["finalise", "requete", "refuse"].includes(d.statut)) return { sante: "dans_les_temps", raisons: [] };
  const S = SEUILS_SANTE;
  const retard: string[] = [];
  const surveiller: string[] = [];

  // Fin prévue.
  const continu = d.statut === "continu";
  if (!continu && d.dateFinPrevue && d.dateFinPrevue < jour) retard.push(`Fin prévue dépassée (${dateCourte(d.dateFinPrevue)})`);

  // Livrables.
  const livrablesEnRetard = d.livrables.filter((j) => !j.atteint && j.prevuLe && j.prevuLe < jour);
  const livrablesTresEnRetard = livrablesEnRetard.filter((j) => ecartJours(j.prevuLe!, jour) > S.JOURS_JALON_EN_RETARD);
  if (livrablesTresEnRetard.length) retard.push(`${pluriel(livrablesTresEnRetard.length, "livrable")} en retard de plus de ${S.JOURS_JALON_EN_RETARD} jours`);
  else if (livrablesEnRetard.length) surveiller.push(`${pluriel(livrablesEnRetard.length, "livrable")} en retard`);
  // Un livrable pas encore en retard, mais dont des tâches sont prévues après sa date : il le sera.
  const menaces = d.livrables.filter((j) => !j.atteint && (j.tachesApres ?? 0) > 0 && !(j.prevuLe && j.prevuLe < jour));
  if (menaces.length) {
    const n = menaces.reduce((x, j) => x + (j.tachesApres ?? 0), 0);
    surveiller.push(`${pluriel(n, "tâche prévue", "tâches prévues")} après la date de ${menaces.length > 1 ? "leur livrable" : "son livrable"}`);
  }

  // Tâches en retard, tâches bloquées.
  const ouvertes = d.taches.filter((t) => t.statut !== "faite");
  const aEcheance = ouvertes.filter((t) => t.echeance);
  const enRetard = aEcheance.filter((t) => t.echeance! < jour);
  if (enRetard.length >= S.MIN_TACHES_EN_RETARD && enRetard.length >= aEcheance.length * S.PART_TACHES_EN_RETARD) {
    retard.push(`${pluriel(enRetard.length, "tâche")} en retard sur ${aEcheance.length}`);
  } else {
    const longues = enRetard.filter((t) => ecartJours(t.echeance!, jour) > S.JOURS_TACHE_EN_RETARD);
    if (longues.length) surveiller.push(`${pluriel(longues.length, "tâche")} en retard de plus d'une semaine`);
  }
  const bloquees = ouvertes.filter((t) => t.statut === "bloquee" && t.bloqueeDepuis && ecartJours(t.bloqueeDepuis, jour) > S.JOURS_BLOCAGE);
  if (bloquees.length) surveiller.push(`${pluriel(bloquees.length, "tâche bloquée", "tâches bloquées")} depuis plus d'une semaine`);

  // Fin repoussée récemment.
  const recents = d.reports.filter((r) => r.le >= ajouterJours(jour, -S.JOURS_REPORT_RECENT) && r.avant && r.apres && r.apres > r.avant);
  if (recents.length) surveiller.push(`Fin repoussée le ${dateCourte(recents.map((r) => r.le).sort().at(-1)!)}`);

  // Rythme : au rythme des dernières semaines, le reste tient-il avant la fin prévue ?
  const premiere = d.taches.map((t) => t.creeLe).sort()[0];
  const actives = ouvertes.filter((t) => t.statut !== "bloquee").length;
  if (!continu && d.dateFinPrevue && d.dateFinPrevue >= jour && actives > 0 && premiere && premiere <= ajouterJours(jour, -7 * S.SEMAINES_RYTHME)) {
    const depuis = ajouterJours(jour, -7 * S.SEMAINES_RYTHME);
    const faites = d.taches.filter((t) => t.statut === "faite" && t.termineeLe && t.termineeLe > depuis).length;
    const restantes = Math.max(1, Math.ceil(ecartJours(jour, d.dateFinPrevue) / 7));
    if (!faites) surveiller.push(`Aucune tâche terminée depuis ${S.SEMAINES_RYTHME} semaines`);
    else {
      const besoin = Math.ceil(actives / (faites / S.SEMAINES_RYTHME));
      if (besoin > restantes) surveiller.push(`Au rythme actuel : ${besoin} semaines de travail pour ${pluriel(restantes, "semaine")} restante${restantes > 1 ? "s" : ""}`);
    }
  }

  // Registre des risques : un risque critique ouvert. Phases : une phase qui n'en finit pas.
  if (d.risquesCritiques) surveiller.push(`${pluriel(d.risquesCritiques, "risque critique ouvert", "risques critiques ouverts")} au registre`);
  for (const ph of d.phasesDepassees ?? []) surveiller.push(`Phase « ${ph.nom} » pas terminée (fin prévue le ${dateCourte(ph.fin)})`);

  // Risque signalé par le chef de projet : il aggrave, il n'améliore jamais.
  if (signalActif(d.risque, jour)) surveiller.push(`Risque signalé${d.risque!.par ? ` par ${d.risque!.par}` : ""} : ${d.risque!.motif}`);

  const sante: Sante = retard.length ? "en_retard" : surveiller.length ? "a_surveiller" : "dans_les_temps";
  return { sante, raisons: [...retard, ...surveiller] };
}
