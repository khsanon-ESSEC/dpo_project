/** Calendrier du rapport mensuel au conseil (29 octobre 2026) : dernier jeudi, jour limite des chefs, rappels. */
import { describe, expect, it } from "vitest";
import { calendrierConseil, chefsPeuventEcrire, decalerJoursOuvrables, dernierJeudi, moisDuConseil } from "@/lib/calendrier-conseil";

describe("calendrier du rapport au conseil", () => {
  it("le dernier jeudi du mois", () => {
    expect(dernierJeudi("2026-10-01")).toBe("2026-10-29");
    expect(dernierJeudi("2026-11-01")).toBe("2026-11-26");
    expect(dernierJeudi("2026-12-01")).toBe("2026-12-31");
    expect(dernierJeudi("2027-02-01")).toBe("2027-02-25");
  });
  it("jours ouvrables : sans samedi ni dimanche", () => {
    expect(decalerJoursOuvrables("2026-11-26", 5)).toBe("2026-11-19"); // jeudi → jeudi d'avant
    expect(decalerJoursOuvrables("2026-11-23", 1)).toBe("2026-11-20"); // lundi → vendredi
    expect(decalerJoursOuvrables("2026-11-20", -1)).toBe("2026-11-23"); // vendredi → lundi
  });
  it("novembre 2026 : rappel le 13, relance le 18, figé le 19 au soir, prêt à valider le 20, envoi avant le 26", () => {
    expect(calendrierConseil("2026-11-01")).toEqual({ mois: "2026-11-01", dernierJeudi: "2026-11-26", limiteChefs: "2026-11-19", rappel: "2026-11-13", relance: "2026-11-18", pretAValider: "2026-11-20" });
  });
  it("décembre 2026 : dernier jeudi le 31, jour limite le 24", () => {
    expect(calendrierConseil("2026-12-15")).toMatchObject({ dernierJeudi: "2026-12-31", limiteChefs: "2026-12-24", rappel: "2026-12-18", relance: "2026-12-23", pretAValider: "2026-12-25" });
  });
  it("toujours 5 jours ouvrables avant le dernier jeudi, et 5 jours ouvrables pour écrire après le rappel", () => {
    for (let m = 0; m < 24; m++) {
      const mois = new Date(Date.UTC(2026, 10 + m, 1)).toISOString().slice(0, 10);
      const c = calendrierConseil(mois);
      expect(decalerJoursOuvrables(c.dernierJeudi, 5)).toBe(c.limiteChefs);
      expect(new Date(`${c.limiteChefs}T12:00:00Z`).getUTCDay()).toBe(4);
      expect(new Date(`${c.rappel}T12:00:00Z`).getUTCDay()).toBe(5);
      expect(c.rappel < c.relance && c.relance < c.limiteChefs && c.limiteChefs < c.pretAValider && c.pretAValider < c.dernierJeudi).toBe(true);
    }
  });
  it("le rapport préparé : celui du mois jusqu'à son dernier jeudi, puis celui du mois suivant", () => {
    expect(moisDuConseil("2026-10-29")).toBe("2026-10-01");
    expect(moisDuConseil("2026-10-30")).toBe("2026-11-01");
    expect(moisDuConseil("2026-12-31")).toBe("2026-12-01");
    expect(moisDuConseil("2027-01-01")).toBe("2027-01-01");
    const nov = calendrierConseil("2026-11-01");
    expect(chefsPeuventEcrire(nov, "2026-11-19")).toBe(true);
    expect(chefsPeuventEcrire(nov, "2026-11-20")).toBe(false);
  });
});
