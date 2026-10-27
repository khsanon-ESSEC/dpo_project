/**
 * Dates « métier » : semaines du lundi au dimanche, dans le fuseau de la division.
 * Les dates sans heure circulent en texte AAAA-MM-JJ (comme dans PostgreSQL).
 */
const TZ = process.env.APP_TZ || "America/Port-au-Prince";

/** Date du jour (AAAA-MM-JJ) dans le fuseau de la division, ou DATE_DEMO pour une démonstration. */
export function aujourdhui(): string {
  const demo = process.env.DATE_DEMO;
  if (demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)) return demo;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Maintenant, en heure locale de la division : le jour (DATE_DEMO s'il est fixé) et les minutes
 * depuis minuit (HEURE_DEMO « HH:MM » pour une démonstration, sinon l'heure réelle).
 */
export function maintenantLocal(): { jour: string; minutes: number } {
  const demo = process.env.HEURE_DEMO;
  if (demo && /^([01]\d|2[0-3]):[0-5]\d$/.test(demo)) return { jour: aujourdhui(), minutes: Number(demo.slice(0, 2)) * 60 + Number(demo.slice(3)) };
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const h = Number(parts.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(parts.find((x) => x.type === "minute")?.value ?? 0);
  return { jour: aujourdhui(), minutes: h * 60 + m };
}

/** Jour (AAAA-MM-JJ) d'un instant, dans le fuseau de la division. */
export function dateLocale(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function versDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function versIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ajouterJours(iso: string, n: number): string {
  const d = versDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return versIso(d);
}

/** Lundi de la semaine qui contient cette date. */
export function lundiDe(iso: string): string {
  const d = versDate(iso);
  return ajouterJours(iso, -((d.getUTCDay() + 6) % 7));
}

export function premierDuMois(iso: string, decalageMois = 0): string {
  const d = versDate(iso);
  return versIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalageMois, 1, 12)));
}

/** Nombre de jours entre deux dates (b − a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((versDate(b).getTime() - versDate(a).getTime()) / 86_400_000);
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...options });

/** Le premier du mois s'écrit « 1er ». */
const premier = (t: string) => t.replace(/^1 /, "1er ");

/** « 26 nov. », « 1er oct. » */
export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return "—";
  return premier(fmt({ day: "numeric", month: "short" }).format(versDate(iso)));
}

/** « 26 novembre 2026 », « 1er octobre 2026 » */
export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return "—";
  return premier(fmt({ day: "numeric", month: "long", year: "numeric" }).format(versDate(iso)));
}

/** « octobre 2026 » */
export function moisAnnee(iso: string): string {
  return fmt({ month: "long", year: "numeric" }).format(versDate(iso));
}

/** « Vendredi 30 octobre » */
export function jourComplet(iso: string): string {
  const t = fmt({ weekday: "long", day: "numeric", month: "long" }).format(versDate(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « Lun. », « Mar. »… */
export function jourAbrege(iso: string): string {
  const t = fmt({ weekday: "short" }).format(versDate(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Lettre du jour pour la frise de la semaine. */
export function lettreJour(iso: string): string {
  return ["D", "L", "M", "M", "J", "V", "S"][versDate(iso).getUTCDay()];
}

/** « 14 h 10 » */
export function heure(d: Date): string {
  const t = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return t.replace(":", " h ");
}

/** Échéance relative : « 2 j de retard », « Aujourd'hui », « Lun. » */
export function echeanceRelative(echeance: string | null, jour = aujourdhui()): { texte: string; retard: boolean } {
  if (!echeance) return { texte: "", retard: false };
  const e = ecartJours(jour, echeance);
  if (e < 0) return { texte: `${-e} j de retard`, retard: true };
  if (e === 0) return { texte: "Aujourd'hui", retard: false };
  if (e === 1) return { texte: "Demain", retard: false };
  if (e < 7) return { texte: jourAbrege(echeance), retard: false };
  return { texte: dateCourte(echeance), retard: false };
}
