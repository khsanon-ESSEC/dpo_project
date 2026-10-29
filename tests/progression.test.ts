/** Progression d'un bénéfice d'une mesure à l'autre (29 octobre 2026). */
import { describe, expect, it } from "vitest";
import { nombre, progression, texteEcart, unite } from "@/lib/progression";

describe("progression d'un bénéfice", () => {
  it("lit le nombre et l'unité d'une valeur écrite", () => {
    expect(nombre("48 h")).toBe(48);
    expect(nombre("12,5 %")).toBe(12.5);
    expect(nombre("1 200")).toBe(1200);
    expect(nombre("+12")).toBe(12);
    expect(nombre("-3")).toBe(-3);
    expect(nombre("environ la moitié")).toBeNull();
    expect(unite("48 h")).toBe("h");
    expect(unite("18 %")).toBe("%");
    expect(unite("1 200")).toBe("");
  });

  it("un délai qui baisse vers sa cible : mieux, et le chemin parcouru", () => {
    const p = progression("24", "12", [
      { valeur: "20", le: "2026-10-15" },
      { valeur: "17", le: "2026-10-29" },
    ]);
    expect(p).toMatchObject({ sens: "baisse", ecart: -3, base: "precedent", mieux: true, parcouru: 58, atteinte: false });
    expect(p.precedent).toEqual({ valeur: "20", le: "2026-10-15" });
  });

  it("un recul est signalé ; la cible dépassée compte comme atteinte", () => {
    expect(progression("18 %", "40 %", [{ valeur: "25 %", le: "2026-09-30" }, { valeur: "22 %", le: "2026-10-30" }])).toMatchObject({ sens: "hausse", ecart: -3, mieux: false, parcouru: 18 });
    expect(progression("14", "4", [{ valeur: "3", le: "2026-07-31" }])).toMatchObject({ base: "depart", ecart: -11, mieux: true, atteinte: true, parcouru: 110 });
  });

  it("sans départ ou sans nombre : l'écart quand on peut, sans jugement", () => {
    expect(progression("", "600", [{ valeur: "900", le: "2026-09-30" }, { valeur: "800", le: "2026-10-30" }])).toMatchObject({ sens: null, ecart: -100, mieux: null, parcouru: null });
    expect(progression("24", "12", [{ valeur: "à mesurer", le: "2026-10-30" }])).toMatchObject({ ecart: null, mieux: null });
    expect(progression("24", "12", [])).toMatchObject({ dernier: null, ecart: null });
  });

  it("écrit l'écart à la française", () => {
    expect(texteEcart(-3, "h")).toBe("−3 h");
    expect(texteEcart(2.5, "%")).toBe("+2,5 points");
    expect(texteEcart(1, "%")).toBe("+1 point");
    expect(texteEcart(-1200, "")).toBe("\u22121 200");
    expect(texteEcart(-100, "")).toBe("−100");
  });
});
