/**
 * Risques, phases et temps passé : règles pures (sans base), testées dans tests/lot3.test.ts.
 *
 * Risques (décision du 28 octobre 2026) : probabilité et impact notés 1 (faible), 2 (moyen), 3 (fort) ; la
 * criticité est leur produit (1 à 9). Critique à partir de 6 (fort et au moins moyen), modérée de 3 à 4,
 * faible en dessous. Un risque critique ouvert met le projet « à surveiller ».
 */

export const NIVEAUX = [1, 2, 3] as const;
export type Niveau = (typeof NIVEAUX)[number];
export const LIBELLE_PROBABILITE: Record<Niveau, string> = { 1: "Faible", 2: "Moyenne", 3: "Forte" };
export const LIBELLE_IMPACT: Record<Niveau, string> = { 1: "Faible", 2: "Moyen", 3: "Fort" };

export const STATUTS_RISQUE = ["ouvert", "maitrise", "clos"] as const;
export type StatutRisque = (typeof STATUTS_RISQUE)[number];
export const LIBELLE_STATUT_RISQUE: Record<StatutRisque, string> = { ouvert: "Ouvert", maitrise: "Maîtrisé", clos: "Clos" };

export const niveau = (v: unknown): Niveau => (v === 1 || v === "1" ? 1 : v === 3 || v === "3" ? 3 : 2);
export const statutRisque = (v: unknown): StatutRisque => (v === "maitrise" || v === "clos" ? v : "ouvert");

export function criticite(probabilite: number, impact: number): number {
  return niveau(probabilite) * niveau(impact);
}

export type Gravite = "critique" | "moderee" | "faible";
export function gravite(probabilite: number, impact: number): Gravite {
  const c = criticite(probabilite, impact);
  return c >= 6 ? "critique" : c >= 3 ? "moderee" : "faible";
}
export const LIBELLE_GRAVITE: Record<Gravite, string> = { critique: "Critique", moderee: "Modéré", faible: "Faible" };

/** Les risques qui comptent encore : ouverts d'abord, puis maîtrisés ; du plus critique au moins critique. */
export function trierRisques<T extends { statut: string; probabilite: number; impact: number }>(l: T[]): T[] {
  const rang = (s: string) => (s === "ouvert" ? 0 : s === "maitrise" ? 1 : 2);
  return [...l].sort((x, y) => rang(x.statut) - rang(y.statut) || criticite(y.probabilite, y.impact) - criticite(x.probabilite, x.impact));
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** Les phases proposées pour démarrer (le chef de projet les renomme, en ajoute ou en retire). */
export const PHASES_TYPES = ["Cadrage", "Conception", "Réalisation", "Validation métier", "Déploiement", "Clôture"];

/** Les phases types réparties à parts égales de l'entrée à la fin prévue (sans dates si l'une manque). */
export function repartirPhasesTypes(debut: string | null, fin: string | null): { nom: string; debut: string | null; fin: string | null }[] {
  const jours = debut && fin && fin > debut ? (new Date(`${fin}T12:00:00Z`).getTime() - new Date(`${debut}T12:00:00Z`).getTime()) / 86400000 : 0;
  const jour = (k: number) => new Date(new Date(`${debut}T12:00:00Z`).getTime() + Math.round((jours * k) / PHASES_TYPES.length) * 86400000).toISOString().slice(0, 10);
  return PHASES_TYPES.map((nom, i) => ({ nom, debut: jours ? jour(i) : null, fin: jours ? (i === PHASES_TYPES.length - 1 ? fin : jour(i + 1)) : null }));
}

/**
 * La phase en cours : la première phase pas encore terminée dont le début est passé (ou sans date de début) ;
 * à défaut, la première pas terminée. Aucune si toutes sont terminées.
 */
export function phaseEnCours<T extends { ordre: number; debut: string | null; termineeLe: string | null }>(phases: T[], jour: string): T | null {
  const ouvertes = [...phases].sort((x, y) => x.ordre - y.ordre).filter((p) => !p.termineeLe);
  return ouvertes.find((p) => !p.debut || p.debut <= jour) ?? ouvertes[0] ?? null;
}

/** Une phase dont la fin prévue est passée sans qu'elle soit terminée. */
export function phaseDepassee(p: { fin: string | null; termineeLe: string | null }, jour: string): boolean {
  return !p.termineeLe && !!p.fin && p.fin < jour;
}

// ---------------------------------------------------------------------------
// Temps passé
// ---------------------------------------------------------------------------

/**
 * Une durée saisie : « 1h30 », « 1 h 30 », « 2h », « 45 min », « 1,5 » (heures), « 90 » (minutes si plus de 12).
 * Renvoie des minutes (5 à 1 440), ou null.
 */
export function lireDuree(texte: string): number | null {
  const t = texte.toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  let m: RegExpExecArray | null;
  let minutes: number | null = null;
  if ((m = /^(\d{1,2})h(\d{1,2})?(?:min|mn|m)?$/.exec(t))) minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  else if ((m = /^(\d{1,4})(?:min|mn|m)$/.exec(t))) minutes = Number(m[1]);
  else if ((m = /^(\d{1,2}(?:\.\d{1,2})?)(?:h|heures?)?$/.exec(t))) {
    const n = Number(m[1]);
    minutes = /h/.test(t) || n <= 12 ? Math.round(n * 60) : Math.round(n);
  }
  return minutes !== null && minutes >= 5 && minutes <= 1440 ? minutes : null;
}
