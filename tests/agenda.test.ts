/** « Ajouter à mon agenda » : le fichier iCalendar d'une réunion (29 octobre 2026). */
import { describe, expect, it } from "vitest";
import { echapper, fichierAgenda, instantLocal, plier } from "@/lib/agenda";

const TZ = "America/Port-au-Prince";
const maintenant = new Date("2026-10-29T22:00:00Z");

describe("le fichier d'agenda", () => {
  it("l'heure de Port-au-Prince en temps universel, heure d'été comprise", () => {
    expect(instantLocal("2026-10-30", "14:00", TZ).toISOString()).toBe("2026-10-30T18:00:00.000Z");
    expect(instantLocal("2026-11-02", "14:00", TZ).toISOString()).toBe("2026-11-02T19:00:00.000Z");
  });
  it("une réunion avec une heure", () => {
    const f = fichierAgenda([{ uid: "abc@pilotage-dpo", titre: "UR · Comité de pilotage", jour: "2026-11-02", heure: "10:00", dureeMinutes: 90, description: "Projet UR · Unibank Retail\nAvec : Fabienne Michel, Myriam Valcin" }], { maintenant, tz: TZ });
    expect(f.endsWith("\r\n")).toBe(true);
    const lignes = f.split("\r\n");
    expect(lignes.slice(0, 5)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UNIBANK DPO//Pilotage des projets//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]);
    expect(lignes).toContain("DTSTART:20261102T150000Z");
    expect(lignes).toContain("DTEND:20261102T163000Z");
    expect(lignes).toContain("DTSTAMP:20261029T220000Z");
    expect(lignes).toContain("SUMMARY:UR · Comité de pilotage");
    // Lignes repliées à 75 octets : on les déplie pour lire.
    expect(f.replace(/\r\n /g, "")).toContain("DESCRIPTION:Projet UR · Unibank Retail\\nAvec : Fabienne Michel\\, Myriam Valcin");
    // Rien qui ferait partir une invitation.
    expect(f).not.toMatch(/ORGANIZER|ATTENDEE/);
  });
  it("sans heure : un événement de la journée, qui n'occupe pas l'agenda", () => {
    const f = fichierAgenda([{ uid: "x", titre: "Atelier", jour: "2026-11-30", heure: null, dureeMinutes: 60, description: "" }], { maintenant, tz: TZ });
    expect(f).toContain("DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\nTRANSP:TRANSPARENT");
    expect(f).not.toContain("DESCRIPTION");
  });
  it("échappement et lignes de 75 octets au plus", () => {
    expect(echapper("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const longue = `SUMMARY:${"é".repeat(60)}`;
    const pliee = plier(longue);
    for (const l of pliee.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(pliee.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(longue);
  });
});
