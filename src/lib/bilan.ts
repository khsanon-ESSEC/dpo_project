/**
 * Bilan d'activité : ce que l'application a enregistré sur une période (tâches marquées faites,
 * réunions notées, rapports envoyés). Règles pures, testées dans tests/bilan.test.ts.
 *
 * Ces chiffres décrivent l'activité enregistrée, pas la qualité du travail ni tout ce qui a été fait :
 * ils servent à une conversation, pas à un classement.
 */
import { ajouterJours, lundiDe, premierDuMois } from "./dates";
import { arrondir, ESTIMATION_PAR_DEFAUT, joursOuvres } from "./charge";

export type Periode = { cle: string; debut: string; fin: string };

export type TacheTerminee = { estimationHeures: number | null; echeance: string | null; termineeLe: string };

export type Mesures = {
  /** Tâches marquées faites dans la période. */
  taches: number;
  /** Heures estimées de ces tâches (4 h pour une tâche sans estimation). */
  heures: number;
  /** Part des tâches à échéance terminées à temps, en % ; null s'il n'y en a pas. */
  aLHeure: number | null;
  avecEcheance: number;
  minutesReunion: number;
  /** Heures de travail de la période (capacité de la semaine × jours ouvrés comptés / 5). */
  capaciteHeures: number;
  /** Part du temps de travail passée en réunion, en % ; null si la période n'a pas de jour ouvré. */
  partReunion: number | null;
  rapportsEnvoyes: number;
  rapportsAttendus: number;
};

/** Mesures d'une personne sur une période. `jusqua` borne les jours comptés (aujourd'hui, pour la période en cours). */
export function mesurer(
  p: Periode,
  d: { terminees: TacheTerminee[]; minutesReunion: number; capaciteHebdo: number; rapportsEnvoyes: number; rapportsAttendus: number },
  jusqua: string,
): Mesures {
  const dans = d.terminees.filter((t) => t.termineeLe >= p.debut && t.termineeLe <= p.fin);
  const avecEcheance = dans.filter((t) => t.echeance);
  const aTemps = avecEcheance.filter((t) => t.termineeLe <= t.echeance!).length;
  const fin = p.fin < jusqua ? p.fin : jusqua;
  const jours = fin < p.debut ? 0 : joursOuvres(p.debut, fin).length;
  const capaciteHeures = arrondir((d.capaciteHebdo * jours) / 5);
  return {
    taches: dans.length,
    heures: arrondir(dans.reduce((s, t) => s + (t.estimationHeures && t.estimationHeures > 0 ? t.estimationHeures : ESTIMATION_PAR_DEFAUT), 0)),
    aLHeure: avecEcheance.length ? Math.round((aTemps / avecEcheance.length) * 100) : null,
    avecEcheance: avecEcheance.length,
    minutesReunion: d.minutesReunion,
    capaciteHeures,
    partReunion: capaciteHeures > 0 ? Math.round((d.minutesReunion / 60 / capaciteHeures) * 100) : null,
    rapportsEnvoyes: d.rapportsEnvoyes,
    rapportsAttendus: d.rapportsAttendus,
  };
}

/** Additionne les mesures de plusieurs personnes (total d'une équipe). */
export function additionner(liste: Mesures[]): Mesures {
  const s = (f: (m: Mesures) => number) => liste.reduce((t, m) => t + f(m), 0);
  const avecEcheance = s((m) => m.avecEcheance);
  const aTemps = liste.reduce((t, m) => t + (m.aLHeure !== null ? (m.aLHeure / 100) * m.avecEcheance : 0), 0);
  const capaciteHeures = arrondir(s((m) => m.capaciteHeures));
  const minutesReunion = s((m) => m.minutesReunion);
  return {
    taches: s((m) => m.taches),
    heures: arrondir(s((m) => m.heures)),
    aLHeure: avecEcheance ? Math.round((aTemps / avecEcheance) * 100) : null,
    avecEcheance,
    minutesReunion,
    capaciteHeures,
    partReunion: capaciteHeures > 0 ? Math.round((minutesReunion / 60 / capaciteHeures) * 100) : null,
    rapportsEnvoyes: s((m) => m.rapportsEnvoyes),
    rapportsAttendus: s((m) => m.rapportsAttendus),
  };
}

/** Écart entre deux valeurs : « +3 », « −2 », « = » ; null si l'une manque. */
export function ecart(actuel: number | null, avant: number | null, unite = ""): string | null {
  if (actuel === null || avant === null) return null;
  const d = arrondir(actuel - avant);
  if (d === 0) return "=";
  return `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")}${unite}`;
}

/** Les n semaines qui finissent par celle du jour donné (la plus ancienne d'abord). */
export function semainesJusqua(jour: string, n: number): Periode[] {
  const lundi = lundiDe(jour);
  return Array.from({ length: n }, (_, i) => {
    const debut = ajouterJours(lundi, -7 * (n - 1 - i));
    return { cle: debut, debut, fin: ajouterJours(debut, 6) };
  });
}

/** Un mois « AAAA-MM » : du 1er au dernier jour. */
export function mois(cle: string): Periode {
  const debut = `${cle}-01`;
  return { cle, debut, fin: ajouterJours(premierDuMois(debut, 1), -1) };
}

/** Le mois d'après « AAAA-MM ». */
export function moisSuivant(cle: string): string {
  return premierDuMois(`${cle}-01`, 1).slice(0, 7);
}

/** Le mois d'avant « AAAA-MM ». */
export function moisPrecedent(cle: string): string {
  return premierDuMois(`${cle}-01`, -1).slice(0, 7);
}

/** Lundis des semaines dont le rapport est attendu dans la période : semaines commencées, et pas celle en cours avant vendredi. */
export function semainesDeRapport(p: Periode, jour: string): string[] {
  const lundis: string[] = [];
  for (let l = lundiDe(p.debut) < p.debut ? ajouterJours(lundiDe(p.debut), 7) : lundiDe(p.debut); l <= p.fin; l = ajouterJours(l, 7)) {
    // Le rapport d'une semaine est attendu à partir de son vendredi.
    if (ajouterJours(l, 4) <= jour) lundis.push(l);
  }
  return lundis;
}
