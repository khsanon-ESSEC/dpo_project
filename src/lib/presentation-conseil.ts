/**
 * Présentation proposée pour le rapport au conseil (29 octobre 2026), à comparer avec le tableau habituel : mêmes
 * données, lues autrement. Calculs purs (axe du calendrier, glissements), sans base de données.
 */
import { ajouterJours, ecartJours, premierDuMois } from "./dates";

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
