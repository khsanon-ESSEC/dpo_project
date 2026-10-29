/**
 * Priorité, budget et clôture d'un projet (lot 4, décision du 28 octobre 2026) : règles pures, testées dans
 * tests/lot4.test.ts.
 */
import { ajouterJours } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Priorité (projets et tâches)
// ---------------------------------------------------------------------------

export const PRIORITES = ["haute", "normale", "basse"] as const;
export type Priorite = (typeof PRIORITES)[number];
export const LIBELLE_PRIORITE: Record<Priorite, string> = { haute: "Haute", normale: "Normale", basse: "Basse" };
export const priorite = (v: unknown): Priorite => (v === "haute" || v === "basse" ? v : "normale");
/** Pour trier : haute d'abord, basse en dernier. */
export const rangPriorite = (p: string | null | undefined) => (p === "haute" ? 0 : p === "basse" ? 2 : 1);

// ---------------------------------------------------------------------------
// Budget ([à vérifier] : ce que la DPO suit aujourd'hui)
// ---------------------------------------------------------------------------

export const DEVISES = ["HTG", "USD"] as const;
export type Devise = (typeof DEVISES)[number];
export const devise = (v: unknown): Devise => (v === "USD" ? "USD" : "HTG");
/** Au-delà, une saisie est sûrement une erreur de frappe. */
export const MONTANT_MAX = 1e13;

/**
 * Un montant saisi, en unités : « 2 500 000 », « 2.500.000 », « 2,500,000 », « 2500000 », « 2,5 M », « 800 k ».
 * Renvoie null si illisible ou négatif. Une virgule ou un point suivi d'un ou deux chiffres seulement est une
 * décimale (arrondie à l'unité).
 */
export function lireMontant(texte: string): number | null {
  const t = texte.toLowerCase().replace(/[\s  ]/g, "").replace(/(htg|gourdes?|usd|\$|us)$/u, "");
  if (!t) return null;
  let m: RegExpExecArray | null;
  let n: number | null = null;
  if ((m = /^(\d+(?:[.,]\d+)?)(k|m|md|mds|milliards?|millions?)$/.exec(t))) {
    const base = Number(m[1].replace(",", "."));
    const mult = m[2] === "k" ? 1e3 : m[2] === "m" || m[2].startsWith("million") ? 1e6 : 1e9;
    n = Math.round(base * mult);
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, ""));
  else if ((m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(t))) n = Math.round(Number(`${m[1]}.${m[2] ?? "0"}`));
  return n !== null && Number.isFinite(n) && n >= 0 && n <= MONTANT_MAX ? n : null;
}

const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export function montantTexte(n: number, d: string = "HTG"): string {
  return `${FORMAT.format(n)} ${devise(d)}`;
}

/** Part du budget prévu déjà engagée, en pour cent (null sans budget prévu). */
export function partEngagee(prevu: number | null, engage: number | null): number | null {
  if (!prevu || prevu <= 0 || engage === null) return null;
  return Math.round((engage / prevu) * 100);
}

export type NiveauBudget = "ok" | "attention" | "depasse";
/** À 90 % engagé : attention ; au-delà de 100 % : dépassé. */
export function niveauBudget(prevu: number | null, engage: number | null): NiveauBudget | null {
  const p = partEngagee(prevu, engage);
  if (p === null) return null;
  return p > 100 ? "depasse" : p >= 90 ? "attention" : "ok";
}

// ---------------------------------------------------------------------------
// Clôture
// ---------------------------------------------------------------------------

export const OBJECTIFS = ["oui", "en_partie", "non"] as const;
export type Objectifs = (typeof OBJECTIFS)[number];
export const LIBELLE_OBJECTIFS: Record<Objectifs, string> = { oui: "Atteints", en_partie: "Atteints en partie", non: "Pas atteints" };
export const objectifs = (v: unknown): Objectifs | null => ((OBJECTIFS as readonly string[]).includes(String(v)) ? (v as Objectifs) : null);

/** Un projet se clôture s'il a été accepté, n'est ni finalisé ni archivé. */
export function peutEtreCloture(p: { statut: string; archiveLe: Date | string | null }): boolean {
  return ["en_attente", "en_cours", "continu"].includes(p.statut) && !p.archiveLe;
}

/** Ce qui reste ouvert au moment de clôturer : signalé, sans empêcher la clôture. */
export function pointsAvantCloture(e: { tachesOuvertes: number; livrablesNonValides: number; risquesOuverts: number; phasesOuvertes: number }): string[] {
  const p = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
  return [
    e.tachesOuvertes ? `${p(e.tachesOuvertes, "tâche encore ouverte", "tâches encore ouvertes")} : elles restent dans les listes de leurs personnes ; annulez celles qui n'ont plus lieu d'être.` : null,
    e.livrablesNonValides ? `${p(e.livrablesNonValides, "livrable pas validé", "livrables pas validés")}.` : null,
    e.risquesOuverts ? `${p(e.risquesOuverts, "risque encore ouvert", "risques encore ouverts")} au registre.` : null,
    e.phasesOuvertes ? `${p(e.phasesOuvertes, "phase pas terminée", "phases pas terminées")}.` : null,
  ].filter((x): x is string => !!x);
}

/** La date de clôture : pas dans le futur, pas avant l'entrée du projet, et au plus un an en arrière. */
export function dateClotureValide(d: string | null, jour: string, entree: string | null): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (d > jour || d < ajouterJours(jour, -366)) return null;
  if (entree && d < entree) return null;
  return d;
}
