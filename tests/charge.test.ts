import { describe, expect, it } from "vitest";
import { chargeDUnePersonne, debutPrevu, ESTIMATION_PAR_DEFAUT, joursOuvres, niveauCharge, repartition, semainesAVenir, type TacheCharge } from "@/lib/charge";

// Vendredi 30 octobre 2026 ; semaine du lundi 26 octobre.
const JOUR = "2026-10-30";
const t = (x: Partial<TacheCharge>): TacheCharge => ({ id: "t", assigneId: "p", statut: "a_faire", debut: null, echeance: null, estimationHeures: null, ...x });
const somme = (r: { heures: number }[]) => r.reduce((s, x) => s + x.heures, 0);

describe("répartition des heures", () => {
  it("ne compte que les jours ouvrés", () => {
    expect(joursOuvres("2026-10-30", "2026-11-03")).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
  });
  it("répartit l'estimation entre le début et l'échéance", () => {
    const r = repartition(t({ debut: "2026-11-02", echeance: "2026-11-06", estimationHeures: 20 }), JOUR);
    expect(r).toHaveLength(5);
    expect(r[0].heures).toBe(4);
  });
  it("sans début, commence assez tôt pour tenir à 8 h par jour", () => {
    expect(debutPrevu(t({ echeance: "2026-11-06", estimationHeures: 16 }))).toBe("2026-11-05");
    expect(debutPrevu(t({ echeance: "2026-11-09", estimationHeures: 16 }))).toBe("2026-11-06"); // lundi → vendredi
  });
  it("une tâche en retard est à rattraper aujourd'hui", () => {
    expect(repartition(t({ echeance: "2026-10-28", estimationHeures: 6 }), JOUR)).toEqual([{ jour: JOUR, heures: 6 }]);
  });
  it("rien n'est placé dans le passé : la part restante commence aujourd'hui", () => {
    const r = repartition(t({ debut: "2026-10-26", echeance: "2026-11-03", estimationHeures: 12 }), JOUR);
    expect(r.map((x) => x.jour)).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
    expect(somme(r)).toBeCloseTo(12);
  });
  it("une tâche sans estimation compte pour la valeur par défaut", () => {
    expect(somme(repartition(t({ echeance: "2026-11-04" }), JOUR))).toBe(ESTIMATION_PAR_DEFAUT);
  });
  it("les tâches bloquées, faites ou sans date ne comptent pas", () => {
    expect(repartition(t({ statut: "bloquee", echeance: "2026-11-04", estimationHeures: 8 }), JOUR)).toEqual([]);
    expect(repartition(t({ statut: "faite", echeance: "2026-11-04", estimationHeures: 8 }), JOUR)).toEqual([]);
    expect(repartition(t({ estimationHeures: 8 }), JOUR)).toEqual([]);
  });
});

describe("charge par semaine", () => {
  const semaines = semainesAVenir(JOUR, 3);
  it("compte, pour cette semaine, seulement les jours qui restent", () => {
    const c = chargeDUnePersonne([t({ echeance: JOUR, estimationHeures: 6 })], semaines, 40, JOUR);
    expect(c.semaines[0].capacite).toBe(8);
    expect(c.semaines[0].heures).toBe(6);
    expect(c.semaines[0].niveau).toBe("normale");
    expect(c.semaines[1].capacite).toBe(40);
  });
  it("repère une personne surchargée", () => {
    const taches = [
      t({ id: "a", echeance: "2026-10-28", estimationHeures: 6 }), // en retard
      t({ id: "b", echeance: JOUR, estimationHeures: 4 }),
      t({ id: "c", statut: "bloquee", echeance: "2026-10-28", estimationHeures: 8 }),
    ];
    const c = chargeDUnePersonne(taches, semaines, 40, JOUR);
    expect(c.semaines[0].heures).toBe(10);
    expect(c.semaines[0].niveau).toBe("surchargee");
    expect(c.enRetard).toBe(1);
    expect(c.bloquees).toBe(1);
    expect(c.semaines[0].taches[0]).toEqual({ id: "a", heures: 6 });
  });
  it("signale les tâches sans estimation et sans date", () => {
    const c = chargeDUnePersonne([t({ id: "a" }), t({ id: "b", echeance: "2026-11-10" })], semaines, 40, JOUR);
    expect(c.sansDate).toBe(1);
    expect(c.sansEstimation).toBe(2);
  });
  it("niveaux : libre, normale, chargée, surchargée", () => {
    expect(niveauCharge(0, 40)).toBe("libre");
    expect(niveauCharge(30, 40)).toBe("normale");
    expect(niveauCharge(36, 40)).toBe("chargee");
    expect(niveauCharge(41, 40)).toBe("surchargee");
  });
});
