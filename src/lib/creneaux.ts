/**
 * Créneaux de réunion : deux réunions se chevauchent si l'une commence avant la fin de l'autre. Seules les
 * réunions avec une heure comptent (sans heure, on ne sait pas quand). Pur ; testé dans tests/creneaux.test.ts.
 */
export const minutesDe = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

export function chevauche(a: { heure: string; duree: number }, b: { heure: string; duree: number }): boolean {
  const da = minutesDe(a.heure);
  const db = minutesDe(b.heure);
  return da < db + b.duree && db < da + a.duree;
}

/** « 10 h », « 10 h 30 ». */
export const texteHeure = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
};

export type Occupation = { debut: number; fin: number; titre: string | null };
/** `absent` : une absence (congé, formation, mission) est notée ce jour-là ; son motif n'est pas dit. */
export type Disponibilite = { id: string; nom: string; moi: boolean; occupe: Occupation[]; absent?: boolean };

/**
 * « Vous êtes déjà pris de 10 h à 11 h (« Comité ») », « Fabienne Michel est prise de 10 h à 11 h »,
 * « Myriam Valcin est absente ce jour-là ».
 */
export function phraseOccupe(d: Disponibilite): string {
  if (d.absent) return d.moi ? "Vous êtes absent(e) ce jour-là" : `${d.nom} est absent(e) ce jour-là`;
  const plages = d.occupe.map((o) => `de ${texteHeure(o.debut)} à ${texteHeure(o.fin)}${o.titre ? ` (« ${o.titre} »)` : ""}`).join(", ");
  return d.moi ? `Vous êtes déjà pris(e) ${plages}` : `${d.nom} est déjà pris(e) ${plages}`;
}
