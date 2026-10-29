/** Présentation proposée du rapport au conseil (29 octobre 2026) : glissements et axe du calendrier. */
import { describe, expect, it } from "vitest";
import { axeCalendrier, ecart, texteEcart } from "@/lib/presentation-conseil";

describe("présentation du rapport au conseil", () => {
  it("le glissement s'écrit en jours, en semaines ou en mois", () => {
    expect(texteEcart(null)).toBe("");
    expect(texteEcart(0)).toBe("inchangée");
    expect(texteEcart(5)).toBe("+5 j");
    expect(texteEcart(28)).toBe("+4 sem.");
    expect(texteEcart(-14)).toBe("−2 sem.");
    expect(texteEcart(483)).toBe("+16 mois");
    expect(ecart("2026-10-29", "2026-11-26")).toBe(28);
    expect(ecart(null, "2026-11-26")).toBeNull();
  });

  it("l'axe couvre toutes les dates (et aujourd'hui), avec un mois de marge et un repère par trimestre", () => {
    const axe = axeCalendrier(
      [
        { entree: "2024-06-25", finInitiale: "2025-07-31", finDernier: "2026-10-29", nouvelleFin: "2026-11-26", lancement: "2026-12-10" },
        { entree: null, finInitiale: null, finDernier: null, nouvelleFin: null, lancement: null },
      ],
      "2026-10-30",
    );
    expect(axe.debut).toBe("2024-05-01");
    expect(axe.fin).toBe("2027-01-31");
    expect(axe.position("2024-05-01")).toBe(0);
    expect(axe.position("2027-01-31")).toBe(100);
    expect(axe.position("2020-01-01")).toBe(0);
    expect(axe.reperes.map((r) => r.libelle)).toEqual(["juil.", "oct.", "2025", "avr.", "juil.", "oct.", "2026", "avr.", "juil.", "oct.", "2027"]);
    expect(axe.reperes.filter((r) => r.annee).map((r) => r.iso)).toEqual(["2025-01-01", "2026-01-01", "2027-01-01"]);
    // Aujourd'hui seul : l'axe existe quand même.
    expect(axeCalendrier([], "2026-10-30").debut).toBe("2026-09-01");
  });
});
