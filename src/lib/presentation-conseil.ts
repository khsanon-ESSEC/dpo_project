/**
 * Présentation proposée pour le rapport au conseil (29 octobre 2026), à comparer avec le tableau habituel : mêmes
 * données, lues autrement. Calculs purs (axe du calendrier, glissements), sans base de données.
 */
import { ajouterJours, dateCourteAnnee, ecartJours, premierDuMois } from "./dates";

/** Ce que le rapport montre en plus des dates et de l'état, figé à l'approbation (lignes_conseil.apercu). */
export type ApercuConseil = {
  sante: string;
  livrables: { valides: number; total: number; prochain: { libelle: string; prevuLe: string | null; enRetard: boolean } | null } | null;
  risqueCritique: string | null;
  /** Jour où l'aperçu a été pris (l'« aujourd'hui » du calendrier). */
  le: string;
};

export type DatesProjet = {
  entree: string | null;
  finInitiale: string | null;
  finDernier: string | null;
  nouvelleFin: string | null;
  lancement: string | null;
};

/** « +3 sem. », « +5 j », « −2 sem. », « inchangée ». Au-delà de 13 jours, en semaines. */
export function texteEcart(jours: number | null): string {
  if (jours === null) return "";
  if (jours === 0) return "inchangée";
  const signe = jours > 0 ? "+" : "−";
  const a = Math.abs(jours);
  if (a < 14) return `${signe}${a} j`;
  const sem = Math.round(a / 7);
  if (sem < 9) return `${signe}${sem} sem.`;
  return `${signe}${Math.round(a / 30.4)} mois`;
}

/** Glissement d'une date de fin, en jours (positif : repoussée). */
export function ecart(avant: string | null, apres: string | null): number | null {
  return avant && apres ? ecartJours(avant, apres) : null;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export type Axe = {
  debut: string;
  fin: string;
  /** Position d'une date sur l'axe, de 0 à 100 (bornée). */
  position: (iso: string) => number;
  /** Repères : un par trimestre (libellé du mois), l'année au premier trimestre. */
  reperes: { iso: string; pc: number; libelle: string; annee: boolean }[];
};

/**
 * L'axe commun du calendrier : du premier mois d'entrée au dernier mois de fin ou de lancement (et jamais sans
 * aujourd'hui), un mois de marge de chaque côté, des repères par trimestre.
 */
export function axeCalendrier(projets: DatesProjet[], jour: string): Axe {
  const toutes = [jour, ...projets.flatMap((p) => [p.entree, p.finInitiale, p.finDernier, p.nouvelleFin, p.lancement])].filter((d): d is string => !!d).sort();
  const premier = toutes[0];
  const dernier = toutes[toutes.length - 1];
  const debut = premierDuMois(premier, -1);
  const fin = ajouterJours(premierDuMois(dernier, 2), -1);
  const total = Math.max(1, ecartJours(debut, fin));
  const position = (iso: string) => Math.min(100, Math.max(0, (ecartJours(debut, iso) / total) * 100));
  const reperes: Axe["reperes"] = [];
  for (let m = premierDuMois(debut, 0); m <= fin; m = premierDuMois(m, 1)) {
    const n = Number(m.slice(5, 7));
    if ((n - 1) % 3 !== 0) continue;
    reperes.push({ iso: m, pc: position(m), libelle: n === 1 ? m.slice(0, 4) : MOIS[n - 1], annee: n === 1 });
  }
  return { debut, fin, position, reperes };
}

/** Ordre de lecture du conseil : en retard, puis à surveiller, puis dans les temps. */
export const RANG_SANTE: Record<string, number> = { en_retard: 0, a_surveiller: 1, dans_les_temps: 2 };

export type ProjetEssentiel = {
  dates: DatesProjet;
  /** Glissement de la fin depuis le dernier rapport, en jours. */
  ceMois: number | null;
  /** Glissement depuis la fin prévue initialement, en jours. */
  depuisLeDebut: number | null;
  prochainLivrable: { libelle: string; prevuLe: string | null; enRetard: boolean } | null;
  /** Le risque critique ouvert le plus grave (titre), s'il y en a un. */
  risqueCritique: string | null;
};

/**
 * L'essentiel d'un projet, en quelques mots, pour qui n'a pas le temps de lire le détail (demandé le 29 octobre 2026) :
 * la fin prévue et son glissement, le livrable en retard (ou le prochain), le risque critique, un lancement proche.
 */
export function essentielDuProjet(p: ProjetEssentiel, jour: string): string[] {
  const d = p.dates;
  const points: string[] = [];
  if (d.nouvelleFin) {
    if (p.ceMois && p.ceMois > 0) points.push(`Fin repoussée de ${texteEcart(p.ceMois).slice(1)} ce mois, au ${dateCourteAnnee(d.nouvelleFin)}`);
    else if (p.ceMois && p.ceMois < 0) points.push(`Fin avancée au ${dateCourteAnnee(d.nouvelleFin)}`);
    else points.push(`Fin prévue le ${dateCourteAnnee(d.nouvelleFin)}${p.depuisLeDebut && p.depuisLeDebut > 0 ? ` (${texteEcart(p.depuisLeDebut)} sur la date initiale)` : ""}`);
  }
  const l = p.prochainLivrable;
  if (l?.enRetard) points.push(`Livrable en retard : « ${l.libelle} »${l.prevuLe ? `, prévu le ${dateCourteAnnee(l.prevuLe)}` : ""}`);
  else if (l) points.push(`Prochain livrable : « ${l.libelle} »${l.prevuLe ? ` le ${dateCourteAnnee(l.prevuLe)}` : ""}`);
  if (p.risqueCritique) points.push(`Risque critique : ${p.risqueCritique}`);
  if (d.lancement && d.lancement >= jour && ecartJours(jour, d.lancement) <= 60) points.push(`Lancement le ${dateCourteAnnee(d.lancement)}`);
  return points;
}
