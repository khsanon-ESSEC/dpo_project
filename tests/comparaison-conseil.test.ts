import { describe, expect, it } from "vitest";
import { comparerRapports, ecartTexte, type LigneComparable } from "@/lib/comparaison-conseil";

const ligne = (projetId: string, ordre: number, x: Partial<LigneComparable> = {}): LigneComparable => ({
  projetId,
  code: projetId.toUpperCase(),
  titre: `Projet ${projetId}`,
  programme: "",
  ordre,
  etat: "",
  fin: "2026-12-18",
  lancement: "2026-12-10",
  ...x,
});

describe("comparer deux rapports au conseil", () => {
  it("aligne les projets, dans l'ordre de B puis ceux qui ne sont que dans A", () => {
    const c = comparerRapports([ligne("a", 1), ligne("b", 2), ligne("x", 3)], [ligne("b", 1), ligne("a", 2), ligne("n", 3)]);
    expect(c.lignes.map((l) => l.projetId)).toEqual(["b", "a", "n", "x"]);
    expect(c).toMatchObject({ communs: 2, seulementA: 1, seulementB: 1 });
    expect(c.lignes.find((l) => l.projetId === "n")).toMatchObject({ a: null, finChangee: false });
  });

  it("repère une fin repoussée ou avancée, un lancement changé, un état réécrit (sans compter les espaces)", () => {
    const c = comparerRapports(
      [ligne("a", 1, { etat: "Tests en cours." }), ligne("b", 2), ligne("c", 3, { fin: "2027-02-01", etat: "Prêt  " })],
      [ligne("a", 1, { fin: "2027-01-08", etat: "Tests terminés." }), ligne("b", 2, { lancement: "2027-01-15" }), ligne("c", 3, { fin: "2026-12-18", etat: "Prêt" })],
    );
    const [a, b, cc] = c.lignes;
    expect(a).toMatchObject({ finChangee: true, ecartFinJours: 21, etatChange: true, lancementChange: false });
    expect(b).toMatchObject({ finChangee: false, lancementChange: true, etatChange: false });
    expect(cc).toMatchObject({ finChangee: true, etatChange: false });
    expect(cc.ecartFinJours).toBeLessThan(0);
    expect(c).toMatchObject({ finsRepoussees: 1, finsAvancees: 1, lancementsChanges: 1, etatsChanges: 1 });
  });

  it("écart lisible", () => {
    expect(ecartTexte(21)).toBe("+3 sem.");
    expect(ecartTexte(-5)).toBe("−5 j");
    expect(ecartTexte(92)).toBe("+3 mois");
  });
});
