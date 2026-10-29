import { describe, expect, it } from "vitest";
import { criticite, gravite, lireDuree, phaseDepassee, phaseEnCours, trierRisques } from "@/lib/risques";

describe("risques", () => {
  it("criticité = probabilité × impact ; critique à partir de 6", () => {
    expect(criticite(3, 3)).toBe(9);
    expect(gravite(3, 2)).toBe("critique");
    expect(gravite(2, 2)).toBe("moderee");
    expect(gravite(1, 3)).toBe("moderee");
    expect(gravite(1, 2)).toBe("faible");
  });
  it("ouverts d'abord, puis du plus critique au moins critique", () => {
    const l = trierRisques([
      { id: "a", statut: "clos", probabilite: 3, impact: 3 },
      { id: "b", statut: "ouvert", probabilite: 1, impact: 2 },
      { id: "c", statut: "ouvert", probabilite: 3, impact: 2 },
      { id: "d", statut: "maitrise", probabilite: 3, impact: 3 },
    ]);
    expect(l.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("phases", () => {
  const phases = [
    { ordre: 1, nom: "Cadrage", debut: "2026-01-01", fin: "2026-02-01", termineeLe: "2026-02-03" },
    { ordre: 2, nom: "Conception", debut: "2026-02-01", fin: "2026-05-01", termineeLe: null },
    { ordre: 3, nom: "Réalisation", debut: "2026-05-01", fin: "2026-11-30", termineeLe: null },
  ];
  it("la phase en cours : la première pas terminée et commencée", () => {
    expect(phaseEnCours(phases, "2026-10-30")?.nom).toBe("Conception");
    expect(phaseEnCours(phases.map((p) => ({ ...p, termineeLe: "2026-05-02" })), "2026-10-30")).toBeNull();
    expect(phaseEnCours([{ ordre: 1, debut: "2027-01-01", termineeLe: null, nom: "Plus tard" }], "2026-10-30")?.nom).toBe("Plus tard");
  });
  it("une phase dépassée : fin passée, pas terminée", () => {
    expect(phaseDepassee(phases[1], "2026-10-30")).toBe(true);
    expect(phaseDepassee(phases[0], "2026-10-30")).toBe(false);
    expect(phaseDepassee(phases[2], "2026-10-30")).toBe(false);
  });
});

describe("temps passé", () => {
  it("lit une durée en heures ou en minutes", () => {
    expect(lireDuree("1h30")).toBe(90);
    expect(lireDuree("1 h 30")).toBe(90);
    expect(lireDuree("2h")).toBe(120);
    expect(lireDuree("45 min")).toBe(45);
    expect(lireDuree("1,5")).toBe(90);
    expect(lireDuree("3")).toBe(180);
    expect(lireDuree("90")).toBe(90);
    expect(lireDuree("2 heures")).toBe(120);
    expect(lireDuree("0")).toBeNull();
    expect(lireDuree("25h")).toBeNull();
    expect(lireDuree("beaucoup")).toBeNull();
  });
});
