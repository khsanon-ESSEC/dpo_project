/**
 * Tâches récurrentes (lot 4, décision du 28 octobre 2026) : règles pures, testées dans tests/lot4.test.ts.
 *
 * Une règle se répète chaque semaine (un jour ouvré, du lundi au vendredi) ou chaque mois (le 1er, le 5… ou le
 * dernier jour). Une échéance qui tombe un samedi ou un dimanche passe au vendredi d'avant. La prochaine occurrence
 * est créée quelques jours avant son échéance (6 jours pour une règle hebdomadaire, 10 pour une règle mensuelle) ;
 * une occurrence manquée (serveur arrêté) n'est pas rattrapée : on passe à la suivante.
 */
import { ajouterJours } from "@/lib/dates";

export type Frequence = "semaine" | "mois";
export const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"] as const;
/** Jours du mois proposés ; 31 = le dernier jour du mois. */
export const JOURS_MOIS = [1, 5, 10, 15, 20, 25, 31] as const;
export const DELAI_CREATION: Record<Frequence, number> = { semaine: 6, mois: 10 };

/** « semaine:1 » (lundi) … « semaine:5 », « mois:1 » … « mois:28 », « mois:31 » (dernier jour). */
export function lireRythme(v: unknown): { frequence: Frequence; jour: number } | null {
  const m = /^(semaine|mois):(\d{1,2})$/.exec(String(v ?? ""));
  if (!m) return null;
  const jour = Number(m[2]);
  if (m[1] === "semaine") return jour >= 1 && jour <= 5 ? { frequence: "semaine", jour } : null;
  return (jour >= 1 && jour <= 28) || jour === 31 ? { frequence: "mois", jour } : null;
}

export function rythmeTexte(frequence: string, jour: number): string {
  if (frequence === "semaine") return `chaque ${JOURS_SEMAINE[jour - 1] ?? "semaine"}`;
  return jour === 31 ? "chaque mois, le dernier jour" : `chaque mois, le ${jour === 1 ? "1er" : jour}`;
}

const enDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Un samedi ou un dimanche passe au vendredi d'avant. */
export function jourOuvreAvant(j: string): string {
  const w = enDate(j).getUTCDay();
  return w === 6 ? ajouterJours(j, -1) : w === 0 ? ajouterJours(j, -2) : j;
}

/** L'échéance d'une règle mensuelle dans un mois donné (mois 0 à 11). */
export function echeanceDuMois(annee: number, mois: number, jour: number): string {
  const dernier = new Date(Date.UTC(annee, mois + 1, 0, 12)).getUTCDate();
  return jourOuvreAvant(iso(new Date(Date.UTC(annee, mois, Math.min(jour === 31 ? dernier : jour, dernier), 12))));
}

/** La première échéance de la règle strictement après « apres ». */
export function premiereEcheance(frequence: Frequence, jour: number, apres: string): string {
  if (frequence === "semaine") {
    let d = ajouterJours(apres, 1);
    while (enDate(d).getUTCDay() !== jour) d = ajouterJours(d, 1);
    return d;
  }
  const a = enDate(apres);
  for (let k = 0; k < 3; k++) {
    const e = echeanceDuMois(a.getUTCFullYear(), a.getUTCMonth() + k, jour);
    if (e > apres) return e;
  }
  return echeanceDuMois(a.getUTCFullYear(), a.getUTCMonth() + 3, jour);
}

/**
 * Ce qu'il faut faire aujourd'hui pour une règle : l'échéance visée (la prochaine prévue, ou, si elle est passée,
 * la première à venir), s'il est temps de créer son occurrence, et l'échéance d'après.
 */
export function prochaineOccurrence(r: { frequence: Frequence; jour: number; prochaineLe: string }, aujourdhui: string) {
  const cible = r.prochaineLe >= aujourdhui ? r.prochaineLe : premiereEcheance(r.frequence, r.jour, ajouterJours(aujourdhui, -1));
  return { cible, creer: aujourdhui >= ajouterJours(cible, -DELAI_CREATION[r.frequence]), suivante: premiereEcheance(r.frequence, r.jour, cible) };
}
