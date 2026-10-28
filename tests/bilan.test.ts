import { describe, expect, it } from "vitest";
import { additionner, decalerMois, ecart, exerciceDe, mesurer, mois, moisDebutExercice, moisEntre, moisPrecedent, moisSuivant, nomExercice, planBilan, planSemaines, semainesDeRapport, semainesJusqua } from "@/lib/bilan";
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

describe("périodes du bilan d'équipe", () => {
  it("décale une date d'un nombre de mois, borné au dernier jour", () => {
    expect(decalerMois("2026-10-30", -1)).toBe("2026-09-30");
    expect(decalerMois("2026-03-31", -1)).toBe("2026-02-28");
    expect(decalerMois("2026-10-30", -12)).toBe("2025-10-30");
    expect(moisEntre("2026-08-15", "2026-10-01")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("mois en cours : comparé au mois d'avant à la même date ; six mois de courbe", () => {
    const p = planBilan(undefined, undefined, "2026-10-30", 10);
    expect(p.actuel).toEqual({ cle: "2026-10", debut: "2026-10-01", fin: "2026-10-30" });
    expect(p.precedent).toMatchObject({ debut: "2026-09-01", fin: "2026-09-30" });
    expect(p.axe).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(p.enCours).toBe(true);
    expect(p.apres).toBeNull();
    // Un mois fini se compare au mois d'avant entier (août : 31 jours, après septembre : 30).
    const s = planBilan("mois", "2026-09", "2026-10-30", 10);
    expect(s.precedent).toMatchObject({ debut: "2026-08-01", fin: "2026-08-31" });
    expect(s.apres).toBe("2026-10");
  });

  it("3 et 6 mois : la fenêtre d'avant, à la même date, mois par mois", () => {
    const p = planBilan("3m", undefined, "2026-10-30", 10);
    expect(p.actuel).toMatchObject({ debut: "2026-08-01", fin: "2026-10-30" });
    expect(p.precedent).toMatchObject({ debut: "2026-05-01", fin: "2026-07-30" });
    expect(p.serieAvant!.map((x) => x.cle)).toEqual(["2026-05", "2026-06", "2026-07"]);
    const s = planBilan("6m", "2026-06", "2026-10-30", 10);
    expect(s.actuel).toMatchObject({ debut: "2026-01-01", fin: "2026-06-30" });
    expect(s.precedent).toMatchObject({ debut: "2025-07-01", fin: "2025-12-31" });
    expect(s.apres).toBe("2026-10");
  });

  it("exercice d'octobre à septembre : en cours, comparé au précédent à la même date", () => {
    const p = planBilan("exercice", undefined, "2027-03-15", 10);
    expect(p.actuel).toEqual({ cle: "2026", debut: "2026-10-01", fin: "2027-03-15" });
    expect(p.precedent).toEqual({ cle: "2025", debut: "2025-10-01", fin: "2026-03-15" });
    expect(p.axe).toHaveLength(12);
    expect(p.serie).toHaveLength(6);
    expect(p.serieAvant![0].cle).toBe("2025-10");
    expect(nomExercice(2026, 10)).toBe("2026-2027");
    // Un exercice fini : entier contre entier ; on ne va pas au-delà de l'exercice en cours.
    const f = planBilan("exercice", "2025", "2027-03-15", 10);
    expect(f.actuel.fin).toBe("2026-09-30");
    expect(f.precedent.fin).toBe("2025-09-30");
    expect(f.apres).toBe("2026");
    expect(planBilan("exercice", "2031", "2027-03-15", 10).actuel.cle).toBe("2026");
    expect(exerciceDe("2026-09-30", 10)).toBe(2025);
    expect(moisDebutExercice("13")).toBe(10);
    expect(moisDebutExercice("1")).toBe(1);
  });
});

describe("huit semaines (fiche d'une personne)", () => {
  it("les huit semaines jusqu'à celle en cours, comparées aux huit d'avant à la même date", () => {
    const p = planSemaines(undefined, "2026-10-28");
    expect(p.vue).toBe("semaines");
    expect(p.axe).toHaveLength(8);
    expect(p.axe[0]).toBe("2026-09-07");
    expect(p.axe[7]).toBe("2026-10-26");
    expect(p.actuel).toEqual({ cle: "2026-10-26", debut: "2026-09-07", fin: "2026-10-28" });
    expect(p.precedent).toEqual({ cle: "2026-08-31", debut: "2026-07-13", fin: "2026-09-02" });
    expect(p.serieAvant![0]).toEqual({ cle: "2026-07-13", debut: "2026-07-13", fin: "2026-07-19" });
    expect(p.enCours).toBe(true);
    expect(p.avant).toBe("2026-08-31");
    expect(p.apres).toBeNull();
  });
  it("une semaine passée : la fenêtre entière, et la suivante sans dépasser la semaine en cours", () => {
    const p = planSemaines("2026-09-16", "2026-10-28");
    expect(p.cle).toBe("2026-09-14");
    expect(p.actuel.fin).toBe("2026-09-20");
    expect(p.enCours).toBe(false);
    expect(p.apres).toBe("2026-10-26");
    expect(planSemaines("2026-08-10", "2026-10-28").apres).toBe("2026-10-05");
  });
  it("un paramètre invalide ou futur revient à la semaine en cours", () => {
    expect(planSemaines("n'importe quoi", "2026-10-28").cle).toBe("2026-10-26");
    expect(planSemaines("2027-01-04", "2026-10-28").cle).toBe("2026-10-26");
    expect(planSemaines("2026-13-45", "2026-10-28").cle).toBe("2026-10-26");
  });
});

describe("noms des périodes", () => {
  it("accorde la préposition", async () => {
    const { aLa, nomsDesPeriodes } = await import("@/lib/bilan-libelles");
    expect(aLa("les 8 semaines d'avant")).toBe("aux 8 semaines d'avant");
    expect(aLa("septembre")).toBe("à septembre");
    expect(aLa("l'exercice 2024-2025")).toBe("à l'exercice 2024-2025");
    const n = nomsDesPeriodes(planSemaines(undefined, "2026-10-28"), 10);
    expect(n).toEqual({ actuel: "Ces 8 semaines", avant: "Les 8 semaines d'avant", avantCourt: "les 8 semaines d'avant" });
    expect(nomsDesPeriodes(planSemaines("2026-09-14", "2026-10-28"), 10).actuel).toBe("8 semaines jusqu'au 20 sept.");
    expect(nomsDesPeriodes(planBilan("mois", "2026-09", "2026-10-30", 10), 10).avantCourt).toBe("août");
  });
});
