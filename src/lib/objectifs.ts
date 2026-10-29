/**
 * Objectifs et bénéfices attendus d'un projet (demandé le 29 octobre 2026, « mesurables ») : un objectif est une
 * phrase ; un bénéfice peut porter un indicateur, une valeur de départ et une cible (facultatifs), puis la valeur
 * constatée après le lancement. À la clôture, chaque objectif est dit atteint, atteint en partie ou pas atteint.
 * Règles pures ; la base est dans src/lib/donnees/objectifs.ts. Testé dans tests/objectifs.test.ts.
 */
import { OBJECTIFS, type Objectifs } from "@/lib/suivi";

export const GENRES_OBJECTIF = ["objectif", "benefice"] as const;
export type GenreObjectif = (typeof GENRES_OBJECTIF)[number];
export const estGenreObjectif = (v: unknown): v is GenreObjectif => (GENRES_OBJECTIF as readonly string[]).includes(String(v));

export const MAX_PAR_GENRE = 12;
export const LONGUEUR = { libelle: 300, indicateur: 120, valeur: 60 } as const;

const propre = (v: unknown, max: number) => String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
const majuscule = (s: string) => (s ? s[0].toLocaleUpperCase("fr") + s.slice(1) : s);

export type SaisieObjectif = { libelle: unknown; indicateur?: unknown; depart?: unknown; cible?: unknown };
export type ValeursObjectif = { libelle: string; indicateur: string; depart: string; cible: string };

/** Lit un objectif ou un bénéfice saisi. Un objectif n'a que son libellé ; un bénéfice peut avoir indicateur, départ, cible. */
export function validerObjectif(genre: GenreObjectif, d: SaisieObjectif): { valeurs: ValeursObjectif } | { erreur: string } {
  const libelle = majuscule(propre(d.libelle, LONGUEUR.libelle));
  if (libelle.length < 3) return { erreur: genre === "objectif" ? "Écrivez l'objectif en une phrase." : "Écrivez le bénéfice attendu en une phrase." };
  if (genre === "objectif") return { valeurs: { libelle, indicateur: "", depart: "", cible: "" } };
  const indicateur = majuscule(propre(d.indicateur, LONGUEUR.indicateur));
  const depart = propre(d.depart, LONGUEUR.valeur);
  const cible = propre(d.cible, LONGUEUR.valeur);
  if ((depart || cible) && !indicateur) return { erreur: "Une valeur de départ ou une cible se rapporte à un indicateur : nommez-le (ex. : « Temps de traitement des demandes »)." };
  return { valeurs: { libelle, indicateur, depart, cible } };
}

/** Un bénéfice est mesurable quand il a un indicateur et une cible. */
export const estMesurable = (b: { indicateur: string; cible: string }) => !!b.indicateur && !!b.cible;

/** « Temps de traitement des demandes : 48 h → 24 h » (ce qui est connu). */
export function texteMesure(b: { indicateur: string; depart: string; cible: string }): string {
  if (!b.indicateur) return "";
  const valeurs = b.depart && b.cible ? `${b.depart} → ${b.cible}` : b.cible ? `cible ${b.cible}` : b.depart ? `départ ${b.depart}` : "";
  return valeurs ? `${b.indicateur} : ${valeurs}` : b.indicateur;
}

export const evaluation = (v: unknown): Objectifs | null => ((OBJECTIFS as readonly string[]).includes(String(v)) ? (v as Objectifs) : null);

/** Le bilan d'ensemble d'après chaque objectif : tous atteints, aucun, ou en partie. */
export function bilanDesObjectifs(evaluations: Objectifs[]): Objectifs | null {
  if (!evaluations.length) return null;
  if (evaluations.every((e) => e === "oui")) return "oui";
  if (evaluations.every((e) => e === "non")) return "non";
  return "en_partie";
}

/** Une valeur constatée se note sur un projet en cours ou finalisé (les bénéfices se voient après le lancement). */
export function peutNoterConstat(p: { statut: string; archiveLe: Date | string | null }): boolean {
  return ["en_attente", "en_cours", "continu", "finalise"].includes(p.statut) && !p.archiveLe;
}

/** Objectifs proposés dans une demande de projet : un par ligne (puces et numéros retirés), 12 au plus. */
export function objectifsDuTexte(texte: unknown): string[] {
  return String(texte ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*·o]|\d+[.)])\s+/, ""))
    .map((l) => majuscule(propre(l, LONGUEUR.libelle)))
    .filter((l) => l.length >= 3)
    .slice(0, MAX_PAR_GENRE);
}
