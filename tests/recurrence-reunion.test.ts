import { describe, expect, it } from "vitest";
import { controlerSerie, joursDeLaSerie, OCCURRENCES_MAX, serieTexte } from "@/lib/recurrence-reunion";

describe("réunions récurrentes : les jours d'une série", () => {
  it("chaque semaine, toutes les deux semaines, jusqu'à la date de fin comprise", () => {
    expect(joursDeLaSerie("2026-11-05", "semaine", "2026-11-26")).toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
    expect(joursDeLaSerie("2026-11-05", "quinzaine", "2026-12-03")).toEqual(["2026-11-05", "2026-11-19", "2026-12-03"]);
  });
  it("chaque jour ouvré : sans samedi ni dimanche", () => {
    expect(joursDeLaSerie("2026-10-30", "ouvre", "2026-11-04")).toEqual(["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("chaque mois : même quantième, le dernier jour d'un mois plus court", () => {
    expect(joursDeLaSerie("2026-10-31", "mois", "2027-03-31")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  });
  it("contrôles : rythme connu, fin après le début, un an au plus ; 260 réunions au plus", () => {
    expect(controlerSerie("2026-11-05", "semaine", "2026-12-17")).toEqual({ ok: true, rythme: "semaine", jusquau: "2026-12-17" });
    expect(controlerSerie("2026-11-05", "tous les ans", "2026-12-17")).toHaveProperty("erreur");
    expect(controlerSerie("2026-11-05", "semaine", "")).toHaveProperty("erreur");
    expect(controlerSerie("2026-11-05", "semaine", "2026-11-05")).toHaveProperty("erreur");
    expect(controlerSerie("2026-11-05", "semaine", "2027-12-01")).toHaveProperty("erreur");
    expect(joursDeLaSerie("2026-01-01", "ouvre", "2027-01-01").length).toBeLessThanOrEqual(OCCURRENCES_MAX);
  });
  it("texte d'une série", () => {
    expect(serieTexte("semaine", "17 déc.")).toBe("chaque semaine jusqu'au 17 déc.");
    expect(serieTexte("ouvre", "4 nov.")).toBe("chaque jour ouvré jusqu'au 4 nov.");
  });
});
