import { describe, expect, it } from "vitest";
import { dateClotureValide, lireMontant, montantTexte, niveauBudget, objectifs, partEngagee, peutEtreCloture, pointsAvantCloture, priorite, rangPriorite } from "@/lib/suivi";
import { echeanceDuMois, jourOuvreAvant, lireRythme, premiereEcheance, prochaineOccurrence, rythmeTexte } from "@/lib/recurrence";

describe("priorité", () => {
  it("haute, normale, basse ; tout le reste est normal ; haute d'abord", () => {
    expect(priorite("haute")).toBe("haute");
    expect(priorite("urgente")).toBe("normale");
    expect(priorite(undefined)).toBe("normale");
    expect(["basse", "normale", "haute"].sort((a, b) => rangPriorite(a) - rangPriorite(b))).toEqual(["haute", "normale", "basse"]);
  });
});

describe("budget", () => {
  it("lit les montants comme on les écrit", () => {
    expect(lireMontant("2 500 000")).toBe(2_500_000);
    expect(lireMontant("2.500.000")).toBe(2_500_000);
    expect(lireMontant("2,500,000")).toBe(2_500_000);
    expect(lireMontant("2500000")).toBe(2_500_000);
    expect(lireMontant("2,5 M")).toBe(2_500_000);
    expect(lireMontant("800 k")).toBe(800_000);
    expect(lireMontant("1,2 milliard")).toBe(1_200_000_000);
    expect(lireMontant("12 500 HTG")).toBe(12_500);
    expect(lireMontant("1 250,50")).toBe(1251);
    expect(lireMontant("-5")).toBeNull();
    expect(lireMontant("beaucoup")).toBeNull();
    expect(lireMontant("")).toBeNull();
  });
  it("part engagée et niveau : attention à 90 %, dépassé au-delà de 100 %", () => {
    expect(partEngagee(12_500_000, 11_800_000)).toBe(94);
    expect(partEngagee(null, 5)).toBeNull();
    expect(niveauBudget(100, 50)).toBe("ok");
    expect(niveauBudget(100, 90)).toBe("attention");
    expect(niveauBudget(100, 101)).toBe("depasse");
    expect(niveauBudget(0, 10)).toBeNull();
  });
  it("affiche le montant et la devise", () => {
    expect(montantTexte(2_500_000, "HTG").replace(/\s/g, " ")).toBe("2 500 000 HTG");
    expect(montantTexte(1000, "EUR")).toMatch(/HTG$/);
  });
});

describe("clôture", () => {
  it("un projet accepté, ni finalisé ni archivé, se clôture", () => {
    expect(peutEtreCloture({ statut: "en_cours", archiveLe: null })).toBe(true);
    expect(peutEtreCloture({ statut: "continu", archiveLe: null })).toBe(true);
    expect(peutEtreCloture({ statut: "finalise", archiveLe: null })).toBe(false);
    expect(peutEtreCloture({ statut: "requete", archiveLe: null })).toBe(false);
    expect(peutEtreCloture({ statut: "en_cours", archiveLe: new Date() })).toBe(false);
  });
  it("ce qui reste ouvert est dit, sans empêcher la clôture", () => {
    expect(pointsAvantCloture({ tachesOuvertes: 0, livrablesNonValides: 0, risquesOuverts: 0, phasesOuvertes: 0 })).toEqual([]);
    const l = pointsAvantCloture({ tachesOuvertes: 2, livrablesNonValides: 1, risquesOuverts: 0, phasesOuvertes: 3 });
    expect(l).toHaveLength(3);
    expect(l[0]).toMatch(/^2 tâches encore ouvertes/);
    expect(l[1]).toBe("1 livrable pas validé.");
    expect(l[2]).toBe("3 phases pas terminées.");
  });
  it("objectifs et date de clôture", () => {
    expect(objectifs("en_partie")).toBe("en_partie");
    expect(objectifs("peut-être")).toBeNull();
    expect(dateClotureValide("2026-10-30", "2026-10-30", "2025-01-01")).toBe("2026-10-30");
    expect(dateClotureValide("2026-10-31", "2026-10-30", null)).toBeNull();
    expect(dateClotureValide("2024-12-31", "2026-10-30", null)).toBeNull();
    expect(dateClotureValide("2025-06-01", "2026-10-30", "2025-07-01")).toBeNull();
  });
});

describe("tâches récurrentes", () => {
  it("rythmes acceptés", () => {
    expect(lireRythme("semaine:3")).toEqual({ frequence: "semaine", jour: 3 });
    expect(lireRythme("semaine:6")).toBeNull();
    expect(lireRythme("mois:31")).toEqual({ frequence: "mois", jour: 31 });
    expect(lireRythme("mois:30")).toBeNull();
    expect(lireRythme("chaque jour")).toBeNull();
    expect(rythmeTexte("semaine", 1)).toBe("chaque lundi");
    expect(rythmeTexte("mois", 1)).toBe("chaque mois, le 1er");
    expect(rythmeTexte("mois", 31)).toBe("chaque mois, le dernier jour");
  });
  it("un samedi ou un dimanche passe au vendredi d'avant", () => {
    expect(jourOuvreAvant("2026-10-31")).toBe("2026-10-30"); // samedi
    expect(jourOuvreAvant("2026-11-01")).toBe("2026-10-30"); // dimanche
    expect(jourOuvreAvant("2026-11-02")).toBe("2026-11-02");
    expect(echeanceDuMois(2026, 9, 31)).toBe("2026-10-30"); // 31 octobre 2026 : un samedi
    expect(echeanceDuMois(2027, 1, 31)).toBe("2027-02-26"); // 28 février 2027 : un dimanche
    expect(echeanceDuMois(2026, 11, 15)).toBe("2026-12-15");
  });
  it("prochaine échéance : chaque mercredi, chaque 15, chaque fin de mois", () => {
    expect(premiereEcheance("semaine", 3, "2026-10-28")).toBe("2026-11-04"); // après un mercredi : le suivant
    expect(premiereEcheance("semaine", 3, "2026-10-27")).toBe("2026-10-28");
    expect(premiereEcheance("mois", 15, "2026-10-15")).toBe("2026-11-13"); // 15 novembre : un dimanche
    expect(premiereEcheance("mois", 15, "2026-10-14")).toBe("2026-10-15");
    expect(premiereEcheance("mois", 31, "2026-10-30")).toBe("2026-11-30");
    expect(premiereEcheance("mois", 31, "2026-10-29")).toBe("2026-10-30");
  });
  it("créée quelques jours avant ; une occurrence manquée n'est pas rattrapée", () => {
    // Chaque mercredi ; prochaine le 11 novembre : créée à partir du 5.
    expect(prochaineOccurrence({ frequence: "semaine", jour: 3, prochaineLe: "2026-11-11" }, "2026-11-04")).toMatchObject({ cible: "2026-11-11", creer: false });
    expect(prochaineOccurrence({ frequence: "semaine", jour: 3, prochaineLe: "2026-11-11" }, "2026-11-05")).toEqual({ cible: "2026-11-11", creer: true, suivante: "2026-11-18" });
    // Serveur arrêté trois semaines : on vise le mercredi qui vient, sans recréer les trois manqués.
    expect(prochaineOccurrence({ frequence: "semaine", jour: 3, prochaineLe: "2026-10-14" }, "2026-11-02")).toEqual({ cible: "2026-11-04", creer: true, suivante: "2026-11-11" });
    // Chaque mois le 15 : créée dix jours avant.
    expect(prochaineOccurrence({ frequence: "mois", jour: 15, prochaineLe: "2026-12-15" }, "2026-12-04")).toMatchObject({ creer: false });
    expect(prochaineOccurrence({ frequence: "mois", jour: 15, prochaineLe: "2026-12-15" }, "2026-12-05")).toMatchObject({ creer: true, suivante: "2027-01-15" });
  });
});
