/**
 * Progression d'un bénéfice attendu d'une mesure à l'autre (décidé le 29 octobre 2026) : chaque valeur constatée est
 * gardée avec sa date ; on compare la dernière à la précédente, et on situe la dernière entre le départ et la cible.
 * Les valeurs sont du texte (« 48 h », « 18 % », « 1 200 », « +12 ») : on en lit le nombre. Sans nombre lisible, on
 * montre l'historique sans calcul.
 */

/** Le nombre d'une valeur : « 48 h » → 48, « 12,5 % » → 12.5, « 1 200 » → 1200, « +12 » → 12, « -3 » → -3. */
export function nombre(v: string | null | undefined): number | null {
  const m = String(v ?? "").match(/[-+−]?\s?\d[\d\s  ]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/[\s  ]/g, "").replace("−", "-").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** L'unité ou le suffixe d'une valeur (« 48 h » → « h », « 18 % » → « % »), pour écrire l'écart. */
export function unite(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^[-+−]?\s?\d[\d\s  ]*(?:[.,]\d+)?\s*(.*)$/);
  return m ? m[1].trim() : "";
}

export type Constat = { valeur: string; le: string };

export type Progression = {
  /** « baisse » si la cible est sous le départ (un délai, des incidents), « hausse » sinon ; null sans départ et cible chiffrés. */
  sens: "baisse" | "hausse" | null;
  dernier: Constat | null;
  precedent: Constat | null;
  /** Dernier moins précédent (ou moins le départ, s'il n'y a qu'un constat), quand les deux sont chiffrés. */
  ecart: number | null;
  /** Par rapport à quoi l'écart est mesuré. */
  base: "precedent" | "depart" | null;
  /** L'écart va-t-il vers la cible ? null si on ne sait pas (pas de sens, pas d'écart, écart nul). */
  mieux: boolean | null;
  /** Part du chemin entre le départ et la cible déjà faite par la dernière valeur (0 à 100, plus si dépassée). */
  parcouru: number | null;
  atteinte: boolean;
};

/** `constats` : du plus ancien au plus récent. */
export function progression(depart: string, cible: string, constats: Constat[]): Progression {
  const d = nombre(depart);
  const c = nombre(cible);
  const sens = d !== null && c !== null && d !== c ? (c < d ? "baisse" : "hausse") : null;
  const dernier = constats.length ? constats[constats.length - 1] : null;
  const precedent = constats.length > 1 ? constats[constats.length - 2] : null;
  const vd = dernier ? nombre(dernier.valeur) : null;
  const vp = precedent ? nombre(precedent.valeur) : null;
  const base = precedent ? (vp !== null ? "precedent" : null) : d !== null && dernier ? "depart" : null;
  const reference = base === "precedent" ? vp : base === "depart" ? d : null;
  const ecart = vd !== null && reference !== null ? arrondi(vd - reference) : null;
  const mieux = sens && ecart ? (sens === "baisse" ? ecart < 0 : ecart > 0) : null;
  const parcouru = sens && vd !== null ? Math.round(((vd - d!) / (c! - d!)) * 100) : null;
  const atteinte = sens !== null && vd !== null && (sens === "baisse" ? vd <= c! : vd >= c!);
  return { sens, dernier, precedent, ecart, base, mieux, parcouru, atteinte };
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * L'écart écrit : « −3 h », « +2,5 points » (virgule française, signe toujours écrit). Entre deux pourcentages,
 * l'écart se dit en points (de 24 % à 27 % : +3 points, pas +3 %).
 */
export function texteEcart(ecart: number, u: string): string {
  const s = Math.abs(ecart).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
  const suffixe = !u ? "" : u.startsWith("%") ? (Math.abs(ecart) > 1 ? " points" : " point") : ` ${u}`;
  return `${ecart < 0 ? "\u2212" : "+"}${s}${suffixe}`;
}
