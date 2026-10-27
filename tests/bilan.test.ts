import { describe, expect, it } from "vitest";
import { additionner, ecart, mesurer, mois, moisPrecedent, moisSuivant, semainesDeRapport, semainesJusqua } from "@/lib/bilan";
import { chargeDUnePersonne } from "@/lib/charge";
import { lireReunions, nouveauChamp, validerChamps } from "@/lib/modeles";

const semaine = { cle: "2026-10-19", debut: "2026-10-19", fin: "2026-10-25" };
const vide = { terminees: [], minutesReunion: 0, capaciteHebdo: 40, rapportsEnvoyes: 0, rapportsAttendus: 0 };

describe("bilan d'une période", () => {
  it("compte les tâches terminées dans la période, leurs heures (4 h sans estimation) et la part à temps", () => {
    const m = mesurer(
      semaine,
      {
        ...vide,
        terminees: [
          { estimationHeures: 6, echeance: "2026-10-21", termineeLe: "2026-10-20" },
          { estimationHeures: null, echeance: "2026-10-20", termineeLe: "2026-10-22" },
          { estimationHeures: 2, echeance: null, termineeLe: "2026-10-23" },
          { estimationHeures: 8, echeance: "2026-10-12", termineeLe: "2026-10-16" }, // semaine d'avant
        ],
      },
      "2026-10-30",
    );
    expect(m.taches).toBe(3);
    expect(m.heures).toBe(12);
    expect(m.avecEcheance).toBe(2);
    expect(m.aLHeure).toBe(50);
  });
  it("rapporte les réunions au temps de travail, compté jusqu'à aujourd'hui pour la semaine en cours", () => {
    const finie = mesurer(semaine, { ...vide, minutesReunion: 600 }, "2026-10-30");
    expect(finie.capaciteHeures).toBe(40);
    expect(finie.partReunion).toBe(25);
    const enCours = mesurer({ cle: "2026-10-26", debut: "2026-10-26", fin: "2026-11-01" }, { ...vide, minutesReunion: 240 }, "2026-10-27");
    expect(enCours.capaciteHeures).toBe(16);
    expect(enCours.partReunion).toBe(25);
    expect(mesurer(semaine, vide, "2026-10-01").partReunion).toBeNull();
  });
  it("additionne une équipe en pondérant la part à temps par le nombre de tâches à échéance", () => {
    const a = { ...mesurer(semaine, vide, "2026-10-30"), taches: 4, avecEcheance: 4, aLHeure: 100, minutesReunion: 120 };
    const b = { ...mesurer(semaine, vide, "2026-10-30"), taches: 1, avecEcheance: 1, aLHeure: 0, minutesReunion: 480 };
    const t = additionner([a, b]);
    expect(t.taches).toBe(5);
    expect(t.aLHeure).toBe(80);
    expect(t.capaciteHeures).toBe(80);
    expect(t.partReunion).toBe(13);
  });
  it("écrit les écarts sans ambiguïté", () => {
    expect(ecart(5, 3)).toBe("+2");
    expect(ecart(3, 5, " h")).toBe("−2 h");
    expect(ecart(2.5, 1, " h")).toBe("+1,5 h");
    expect(ecart(4, 4)).toBe("=");
    expect(ecart(null, 4)).toBeNull();
  });
});

describe("périodes", () => {
  it("huit semaines finissant par celle du jour", () => {
    const s = semainesJusqua("2026-10-30", 8);
    expect(s).toHaveLength(8);
    expect(s.at(-1)).toEqual({ cle: "2026-10-26", debut: "2026-10-26", fin: "2026-11-01" });
    expect(s[0].debut).toBe("2026-09-07");
  });
  it("mois, mois précédent, mois suivant", () => {
    expect(mois("2026-02")).toEqual({ cle: "2026-02", debut: "2026-02-01", fin: "2026-02-28" });
    expect(moisPrecedent("2026-01")).toBe("2025-12");
    expect(moisSuivant("2026-12")).toBe("2027-01");
  });
  it("les rapports attendus : semaines commencées dans la période, à partir de leur vendredi", () => {
    expect(semainesDeRapport(mois("2026-10"), "2026-10-29")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(semainesDeRapport(mois("2026-10"), "2026-10-30")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});

describe("réunions et charge", () => {
  it("les réunions réduisent le temps disponible : les jours qui restent cette semaine, toute la semaine ensuite", () => {
    const sans = chargeDUnePersonne([], ["2026-10-26", "2026-11-02"], 40, "2026-10-28");
    const avec = chargeDUnePersonne([], ["2026-10-26", "2026-11-02"], 40, "2026-10-28", [
      { jour: "2026-10-26", heures: 2 }, // déjà passée : ne compte plus
      { jour: "2026-10-29", heures: 3 },
      { jour: "2026-11-04", heures: 1.5 },
      { jour: "2026-11-07", heures: 4 }, // samedi : hors jours ouvrés
    ]);
    expect(sans.semaines.map((s) => s.capacite)).toEqual([24, 40]);
    expect(avec.semaines.map((s) => s.capacite)).toEqual([21, 38.5]);
    expect(avec.semaines.map((s) => s.reunions)).toEqual([3, 1.5]);
  });
  it("le champ « Réunions de la semaine » : réservé au supérieur par défaut, jamais obligatoire", () => {
    const c = nouveauChamp("reunions", []);
    expect(c.visibilite).toBe("superieur");
    const v = validerChamps([{ ...c, obligatoire: true }], "individuel");
    expect(v.ok && v.champs[0].obligatoire).toBeFalsy();
  });
  it("la liste figée se relit, et une valeur illisible ne casse rien", () => {
    expect(lireReunions('{"minutes":90,"reunions":[{"titre":"Comité","jour":"2026-10-28","heure":"14:00","minutes":90,"projet":"UR","avec":3}]}')?.minutes).toBe(90);
    expect(lireReunions("pas du json")).toBeNull();
    expect(lireReunions("")).toBeNull();
  });
});
