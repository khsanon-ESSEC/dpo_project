/**
 * Réunions récurrentes (demandé le 29 octobre 2026) : les jours d'une série, du premier jour à la date de fin
 * comprise. Pur, testé dans tests/recurrence-reunion.test.ts.
 */

export const RYTHMES_REUNION = {
  ouvre: "Chaque jour ouvré (lundi au vendredi)",
  semaine: "Chaque semaine",
  quinzaine: "Toutes les deux semaines",
  mois: "Chaque mois",
} as const;
export type RythmeReunion = keyof typeof RYTHMES_REUNION;
export const estRythmeReunion = (r: unknown): r is RythmeReunion => typeof r === "string" && r in RYTHMES_REUNION;

/** Un an au plus après la première réunion ; 260 réunions au plus (un jour ouvré sur un an). */
export const DUREE_MAX_SERIE_JOURS = 366;
export const OCCURRENCES_MAX = 260;

const versDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const versIso = (d: Date) => d.toISOString().slice(0, 10);
const plusJours = (iso: string, n: number) => {
  const d = versDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return versIso(d);
};
const dernierJourDuMois = (annee: number, mois: number) => new Date(Date.UTC(annee, mois + 1, 0, 12)).getUTCDate();

export function controlerSerie(debut: string, rythme: unknown, jusquau: unknown): { ok: true; rythme: RythmeReunion; jusquau: string } | { erreur: string } {
  if (!estRythmeReunion(rythme)) return { erreur: "Choisissez le rythme de la réunion." };
  const fin = String(jusquau ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin) || Number.isNaN(versDate(fin).getTime())) return { erreur: "Donnez la date de la dernière réunion de la série." };
  if (fin <= debut) return { erreur: "La fin de la série vient après la première réunion." };
  if (fin > plusJours(debut, DUREE_MAX_SERIE_JOURS)) return { erreur: "Une série dure un an au plus : notez-en une nouvelle ensuite." };
  return { ok: true, rythme, jusquau: fin };
}

/** Les jours de la série, le premier compris. Chaque mois : le même quantième (le dernier jour d'un mois plus court). */
export function joursDeLaSerie(debut: string, rythme: RythmeReunion, jusquau: string): string[] {
  const jours: string[] = [];
  if (rythme === "mois") {
    const d0 = versDate(debut);
    const quantieme = d0.getUTCDate();
    for (let k = 0; jours.length < OCCURRENCES_MAX; k++) {
      const annee = d0.getUTCFullYear() + Math.floor((d0.getUTCMonth() + k) / 12);
      const mois = (d0.getUTCMonth() + k) % 12;
      const j = versIso(new Date(Date.UTC(annee, mois, Math.min(quantieme, dernierJourDuMois(annee, mois)), 12)));
      if (j > jusquau) break;
      jours.push(j);
    }
    return jours;
  }
  const pas = rythme === "quinzaine" ? 14 : rythme === "semaine" ? 7 : 1;
  for (let j = debut; j <= jusquau && jours.length < OCCURRENCES_MAX; j = plusJours(j, pas)) {
    const jourSemaine = versDate(j).getUTCDay();
    if (rythme === "ouvre" && (jourSemaine === 0 || jourSemaine === 6)) continue;
    jours.push(j);
  }
  return jours;
}

/** « chaque semaine jusqu'au 15 déc. » (pour les listes). */
export function serieTexte(rythme: string, jusquauCourt: string): string {
  const r = estRythmeReunion(rythme) ? RYTHMES_REUNION[rythme].replace(/ \(.*\)$/, "").toLowerCase() : "récurrente";
  return `${r} jusqu'au ${jusquauCourt}`;
}
