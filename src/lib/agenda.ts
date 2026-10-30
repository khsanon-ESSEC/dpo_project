/**
 * « Ajouter à mon agenda » (29 octobre 2026) : un fichier iCalendar (RFC 5545) qu'Outlook, Google Agenda et le
 * calendrier du téléphone savent ouvrir. Une réunion avec une heure s'y écrit en temps universel (l'heure de
 * Port-au-Prince convertie, heure d'été comprise) ; sans heure, comme un événement de la journée.
 *
 * Rien de ce qu'une invitation ferait partir : ni organisateur ni participants (leurs noms sont dans la
 * description), pour qu'ouvrir le fichier n'envoie jamais de courriel. Ni les notes de la réunion.
 * Pur (sans base) ; testé dans tests/agenda.test.ts.
 */

export type EvenementAgenda = {
  /** Identifiant stable : le même fichier rouvert met à jour l'événement au lieu d'en créer un autre. */
  uid: string;
  titre: string;
  jour: string;
  heure: string | null;
  dureeMinutes: number;
  description: string;
  url?: string;
};

/** Décalage du fuseau à cet instant, en minutes (heure locale − temps universel). */
function decalage(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(
    new Date(instant),
  );
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - instant) / 60_000;
}

/** L'instant d'une heure locale du fuseau (« 2026-11-02 », « 14:00 »). */
export function instantLocal(jour: string, heure: string, tz: string): Date {
  const naif = Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10)), Number(heure.slice(0, 2)), Number(heure.slice(3, 5)));
  let t = naif - decalage(naif, tz) * 60_000;
  t = naif - decalage(t, tz) * 60_000;
  return new Date(t);
}

const deuxChiffres = (n: number) => String(n).padStart(2, "0");
/** 20261102T190000Z */
export const horodatage = (d: Date) => `${d.getUTCFullYear()}${deuxChiffres(d.getUTCMonth() + 1)}${deuxChiffres(d.getUTCDate())}T${deuxChiffres(d.getUTCHours())}${deuxChiffres(d.getUTCMinutes())}${deuxChiffres(d.getUTCSeconds())}Z`;
const dateSeule = (jour: string) => jour.replaceAll("-", "");
const lendemain = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Texte d'une propriété : barre oblique inverse, point-virgule, virgule et retour à la ligne échappés. */
export function echapper(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lignes de 75 octets au plus, la suite commençant par une espace, sans couper un caractère. */
export function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = "";
  let octets = 0;
  for (const c of ligne) {
    const n = enc.encode(c).length;
    const limite = morceaux.length ? 74 : 75;
    if (octets + n > limite) {
      morceaux.push(courant);
      courant = "";
      octets = 0;
    }
    courant += c;
    octets += n;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}

export function fichierAgenda(evenements: EvenementAgenda[], o: { maintenant: Date; tz: string }): string {
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UNIBANK DPO//Pilotage des projets//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of evenements) {
    lignes.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${horodatage(o.maintenant)}`);
    if (e.heure && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.heure)) {
      const debut = instantLocal(e.jour, e.heure, o.tz);
      lignes.push(`DTSTART:${horodatage(debut)}`, `DTEND:${horodatage(new Date(debut.getTime() + Math.max(5, e.dureeMinutes) * 60_000))}`);
    } else {
      lignes.push(`DTSTART;VALUE=DATE:${dateSeule(e.jour)}`, `DTEND;VALUE=DATE:${dateSeule(lendemain(e.jour))}`, "TRANSP:TRANSPARENT");
    }
    lignes.push(`SUMMARY:${echapper(e.titre)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    if (e.url) lignes.push(`URL:${e.url}`);
    lignes.push("END:VEVENT");
  }
  lignes.push("END:VCALENDAR");
  return `${lignes.map(plier).join("\r\n")}\r\n`;
}
