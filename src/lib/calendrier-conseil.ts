/**
 * Calendrier du rapport mensuel au conseil (décidé le 29 octobre 2026) :
 * - le rapport part avant le dernier jeudi du mois ;
 * - l'état d'avancement écrit par chaque chef de projet se fige 5 jours ouvrables avant ce jeudi (le jeudi d'avant) :
 *   les projets avancent le plus longtemps possible, et les exécutifs ont ensuite la semaine pour valider ;
 * - les chefs reçoivent un rappel le vendredi de la semaine d'avant (5 jours ouvrables pour écrire, jour limite
 *   compris), et une relance la veille du jour limite s'ils n'ont rien écrit ;
 * - le lendemain du jour limite, les exécutifs apprennent que le rapport est prêt à valider.
 * Jours ouvrables : du lundi au vendredi. Les jours fériés ne sont pas connus de l'application [à vérifier].
 * Les dates sont des chaînes « AAAA-MM-JJ » (jour local de la division).
 */

const enDate = (j: string) => new Date(`${j}T12:00:00Z`);
const enJour = (d: Date) => d.toISOString().slice(0, 10);
const ouvrable = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** Le premier jour du mois d'une date (« 2026-11-19 » → « 2026-11-01 »). */
export const moisDe = (jour: string) => `${jour.slice(0, 7)}-01`;

/** Le premier jour du mois suivant. */
export function moisSuivant(mois: string): string {
  const d = enDate(mois);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return enJour(d);
}

/** Le dernier jeudi du mois. */
export function dernierJeudi(mois: string): string {
  const d = enDate(moisSuivant(mois));
  d.setUTCDate(0); // dernier jour du mois
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() - 1);
  return enJour(d);
}

/** Reculer (n > 0) ou avancer (n < 0) de n jours ouvrables. */
export function decalerJoursOuvrables(jour: string, n: number): string {
  const d = enDate(jour);
  const pas = n > 0 ? -1 : 1;
  let reste = Math.abs(n);
  while (reste > 0) {
    d.setUTCDate(d.getUTCDate() + pas);
    if (ouvrable(d)) reste -= 1;
  }
  return enJour(d);
}

export type CalendrierConseil = {
  /** Le mois du rapport (premier jour). */
  mois: string;
  /** Le rapport part avant ce jeudi. */
  dernierJeudi: string;
  /** Dernier jour où le chef de projet écrit (fin de journée) : 5 jours ouvrables avant le dernier jeudi. */
  limiteChefs: string;
  /** Rappel aux chefs : 4 jours ouvrables avant le jour limite (le vendredi de la semaine d'avant). */
  rappel: string;
  /** Relance aux chefs qui n'ont rien écrit : la veille ouvrable du jour limite. */
  relance: string;
  /** Les exécutifs apprennent que le rapport est prêt à valider : le lendemain ouvrable du jour limite. */
  pretAValider: string;
};

export function calendrierConseil(mois: string): CalendrierConseil {
  const m = moisDe(mois);
  const jeudi = dernierJeudi(m);
  const limite = decalerJoursOuvrables(jeudi, 5);
  return { mois: m, dernierJeudi: jeudi, limiteChefs: limite, rappel: decalerJoursOuvrables(limite, 4), relance: decalerJoursOuvrables(limite, 1), pretAValider: decalerJoursOuvrables(limite, -1) };
}

/**
 * Le rapport que les chefs préparent ce jour-là : celui du mois, jusqu'à son dernier jeudi ; ensuite, celui du mois
 * suivant (le rapport du mois est parti).
 */
export function moisDuConseil(jour: string): string {
  const m = moisDe(jour);
  return jour <= dernierJeudi(m) ? m : moisSuivant(m);
}

/** Où en est-on pour les chefs : « ouvert » (ils écrivent), « fige » (après le jour limite). */
export const chefsPeuventEcrire = (cal: CalendrierConseil, jour: string) => jour <= cal.limiteChefs;
