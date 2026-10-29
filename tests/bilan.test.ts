import { describe, expect, it } from "vitest";
import { additionner, decalerMois, ecart, exerciceDe, mesurer, mois, moisDebutExercice, moisEntre, moisPrecedent, moisSuivant, nomExercice, planBilan, semainesDeRapport, semainesJusqua, vueValide } from "@/lib/bilan";
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

describe("semaine (même sélecteur partout)", () => {
  it("la semaine en cours, comparée à la précédente à la même date ; courbe des huit semaines", () => {
    const p = planBilan("semaine", undefined, "2026-10-28", 10);
    expect(p.vue).toBe("semaine");
    expect(p.actuel).toEqual({ cle: "2026-10-26", debut: "2026-10-26", fin: "2026-10-28" });
    expect(p.precedent).toEqual({ cle: "2026-10-19", debut: "2026-10-19", fin: "2026-10-21" });
    expect(p.axe).toHaveLength(8);
    expect(p.axe[0]).toBe("2026-09-07");
    expect(p.serie[7]).toEqual({ cle: "2026-10-26", debut: "2026-10-26", fin: "2026-11-01" });
    expect(p.serieAvant).toBeNull();
    expect(p.enCours).toBe(true);
    expect(p.avant).toBe("2026-10-19");
    expect(p.apres).toBeNull();
  });
  it("une semaine passée, un jour quelconque de la semaine, un paramètre invalide ou futur", () => {
    const p = planBilan("semaine", "2026-09-16", "2026-10-28", 10);
    expect(p.cle).toBe("2026-09-14");
    expect(p.actuel.fin).toBe("2026-09-20");
    expect(p.precedent.fin).toBe("2026-09-13");
    expect(p.enCours).toBe(false);
    expect(p.apres).toBe("2026-09-21");
    expect(planBilan("semaine", "n'importe quoi", "2026-10-28", 10).cle).toBe("2026-10-26");
    expect(planBilan("semaine", "2027-01-04", "2026-10-28", 10).cle).toBe("2026-10-26");
    expect(planBilan("semaine", "2026-13-45", "2026-10-28", 10).cle).toBe("2026-10-26");
  });
  it("vueValide", () => {
    expect(vueValide("semaine")).toBe("semaine");
    expect(vueValide("exercice")).toBe("exercice");
    expect(vueValide("semaines")).toBeNull();
    expect(vueValide(undefined)).toBeNull();
  });
});

describe("noms des périodes", () => {
  it("accorde la préposition", async () => {
    const { aLa, nomsDesPeriodes } = await import("@/lib/bilan-libelles");
    expect(aLa("les 8 semaines d'avant")).toBe("aux 8 semaines d'avant");
    expect(aLa("septembre")).toBe("à septembre");
    expect(aLa("l'exercice 2024-2025")).toBe("à l'exercice 2024-2025");
    expect(aLa("la semaine dernière")).toBe("à la semaine dernière");
    expect(nomsDesPeriodes(planBilan("semaine", undefined, "2026-10-28", 10), 10)).toEqual({ actuel: "Cette semaine", avant: "Semaine du 19 oct.", avantCourt: "la semaine dernière" });
    expect(nomsDesPeriodes(planBilan("semaine", "2026-09-14", "2026-10-28", 10), 10)).toEqual({ actuel: "Semaine du 14 sept.", avant: "Semaine du 7 sept.", avantCourt: "la semaine du 7 sept." });
    expect(nomsDesPeriodes(planBilan("mois", "2026-09", "2026-10-30", 10), 10).avantCourt).toBe("août");
  });
});

describe("charge réalisée et charge prévue", () => {
  it("répartit une tâche terminée de son début à sa fin, jours ouvrés seulement", async () => {
    const { repartitionRealisee } = await import("@/lib/charge");
    // Du jeudi au mardi suivant : quatre jours ouvrés, 3 h chacun.
    expect(repartitionRealisee({ debut: "2026-10-22", termineeLe: "2026-10-27", estimationHeures: 12 })).toEqual([
      { jour: "2026-10-22", heures: 3 },
      { jour: "2026-10-23", heures: 3 },
      { jour: "2026-10-26", heures: 3 },
      { jour: "2026-10-27", heures: 3 },
    ]);
    // Sans début : commencée assez tôt pour tenir à 8 h par jour (12 h → deux jours), et 4 h sans estimation.
    expect(repartitionRealisee({ debut: null, termineeLe: "2026-10-26", estimationHeures: 12 }).map((r) => r.jour)).toEqual(["2026-10-23", "2026-10-26"]);
    expect(repartitionRealisee({ debut: null, termineeLe: "2026-10-21", estimationHeures: null })).toEqual([{ jour: "2026-10-21", heures: 4 }]);
    // Terminée un dimanche : comptée au vendredi ; un début après la fin est ignoré.
    expect(repartitionRealisee({ debut: "2026-10-30", termineeLe: "2026-10-25", estimationHeures: 6 })).toEqual([{ jour: "2026-10-23", heures: 6 }]);
  });
  it("taux réalisé sur les heures disponibles hors réunions, et taux prévu noté le lundi", () => {
    const reparties = [
      { jour: "2026-10-16", heures: 5 }, // semaine d'avant
      { jour: "2026-10-20", heures: 10 },
      { jour: "2026-10-22", heures: 14 },
    ];
    const m = mesurer(semaine, { ...vide, minutesReunion: 480, reparties, prevues: [{ semaine: "2026-10-19", heures: 30, capacite: 32 }, { semaine: "2026-10-12", heures: 9, capacite: 40 }] }, "2026-10-30");
    expect(m.heuresRealisees).toBe(24);
    expect(m.capaciteNette).toBe(32);
    expect(m.tauxCharge).toBe(75);
    expect(m.prevuHeures).toBe(30);
    expect(m.tauxPrevu).toBe(94);
    expect(mesurer(semaine, vide, "2026-10-30").tauxPrevu).toBeNull();
    const t = additionner([m, mesurer(semaine, { ...vide, reparties: [{ jour: "2026-10-21", heures: 40 }] }, "2026-10-30")]);
    expect(t.heuresRealisees).toBe(64);
    expect(t.capaciteNette).toBe(72);
    expect(t.tauxCharge).toBe(89);
    expect(t.tauxPrevu).toBe(94);
  });
});
