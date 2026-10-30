import { describe, expect, it } from "vitest";
import { analyserMiseAJour, analyserReunion, analyserSaisie, estReunion } from "@/lib/saisie-rapide";

// Mercredi 28 octobre 2026
const AUJ = "2026-10-28";
const P = [
  { id: "p-ur", code: "UR", titre: "Nouvelle version UNIBANKOnline Retail" },
  { id: "p-cr", code: "CR", titre: "Refonte Credos" },
];
const a = (s: string, jour = AUJ) => analyserSaisie(s, jour, P);

describe("ajouter une tâche en une ligne", () => {
  it("reconnaît projet, jour de la semaine et estimation ; le reste est le titre", () => {
    expect(a("Relire maquettes UR vendredi 2h")).toMatchObject({ titre: "Relire maquettes", projet: { id: "p-ur" }, echeance: "2026-10-30", heures: 2 });
  });
  it("un titre seul reste un titre", () => {
    expect(a("Appeler la DTI")).toMatchObject({ titre: "Appeler la DTI", projet: null, echeance: null, heures: null });
  });
  it("le code s'écrit tel quel, en majuscules", () => {
    expect(a("Préparer la recette CR").projet?.id).toBe("p-cr");
    expect(a("Préparer la recette cr").projet).toBeNull(); // « cr » en minuscules : un mot comme un autre
    expect(a("Point DTI demain").projet).toBeNull(); // DTI n'est pas un code de projet
    expect(a("Point DTI demain").titre).toBe("Point DTI");
  });
  it("comprend les dates relatives", () => {
    expect(a("x aujourd'hui").echeance).toBe("2026-10-28");
    expect(a("x demain").echeance).toBe("2026-10-29");
    expect(a("x après-demain").echeance).toBe("2026-10-30");
    expect(a("x mercredi").echeance).toBe("2026-10-28"); // aujourd'hui compris
    expect(a("x lundi").echeance).toBe("2026-11-02");
    expect(a("x lundi prochain").echeance).toBe("2026-11-02");
    expect(a("x vendredi prochain").echeance).toBe("2026-11-06");
    expect(a("x semaine prochaine").echeance).toBe("2026-11-06");
    expect(a("x fin du mois").echeance).toBe("2026-10-31");
  });
  it("comprend les dates écrites", () => {
    expect(a("x 12/11").echeance).toBe("2026-11-12");
    expect(a("x 5/1").echeance).toBe("2027-01-05"); // déjà passé cette année : l'an prochain
    expect(a("x 12/11/2027").echeance).toBe("2027-11-12");
    expect(a("x 3 nov.").echeance).toBe("2026-11-03");
    expect(a("x 1er décembre").echeance).toBe("2026-12-01");
    expect(a("x le 30").echeance).toBe("2026-10-30");
    expect(a("x le 5").echeance).toBe("2026-11-05");
    expect(a("x 31/02").echeance).toBeNull(); // date impossible : ignorée
  });
  it("retire les petits mots qui annoncent la date", () => {
    expect(a("Envoyer le contrat pour vendredi").titre).toBe("Envoyer le contrat");
    expect(a("Valider le budget avant le 12/11").titre).toBe("Valider le budget");
    expect(a("Relancer le Crédit d'ici demain").titre).toBe("Relancer le Crédit");
  });
  it("estimation de 1 à 400 heures, avec ou sans espace", () => {
    expect(a("x 3 h").heures).toBe(3);
    expect(a("x en 4 heures").heures).toBe(4);
    expect(a("x 0h").heures).toBeNull();
    expect(a("x 900h").heures).toBeNull();
  });
  it("montre ce qui a été compris", () => {
    expect(a("Relire maquettes UR vendredi 2h").morceaux.map((m) => m.type)).toEqual(["projet", "echeance", "heures"]);
  });
});

const m = (s: string) => analyserMiseAJour(s, AUJ);

describe("mettre à jour une tâche choisie avec « # »", () => {
  it("l'état s'écrit en premier", () => {
    expect(m("faite")).toMatchObject({ statut: "faite", note: "" });
    expect(m("Terminée, envoyée au client")).toMatchObject({ statut: "faite", note: "envoyée au client" });
    expect(m("en cours")).toMatchObject({ statut: "en_cours" });
    expect(m("à faire")).toMatchObject({ statut: "a_faire" });
    expect(m("rouvrir")).toMatchObject({ statut: "a_faire" });
  });
  it("un mot d'état au milieu d'une note ne change rien", () => {
    expect(m("Appel fait avec la DTI")).toMatchObject({ statut: null, note: "Appel fait avec la DTI" });
    expect(m("faites-le savoir")).toMatchObject({ statut: null });
  });
  it("bloquée : le reste dit ce qui bloque, sans y chercher de date", () => {
    expect(m("bloquée : attente de la DTI vendredi")).toMatchObject({ statut: "bloquee", blocage: "Attente de la DTI vendredi", echeance: null });
    expect(m("bloqué par la validation du budget")).toMatchObject({ statut: "bloquee", blocage: "La validation du budget" });
    expect(m("En attente de la signature")).toMatchObject({ statut: "bloquee", blocage: "En attente de la signature" });
    expect(m("bloquée")).toMatchObject({ statut: "bloquee", blocage: null });
  });
  it("date, durée et note se combinent avec l'état", () => {
    expect(m("en cours pour vendredi 3h reste les tests")).toMatchObject({ statut: "en_cours", echeance: "2026-10-30", heures: 3, note: "reste les tests" });
    expect(m("12/11")).toMatchObject({ statut: null, echeance: "2026-11-12", note: "" });
    expect(m("Relancé Patrick ce matin")).toMatchObject({ statut: null, echeance: null, note: "Relancé Patrick ce matin" });
  });
  it("montre ce qui a été compris", () => {
    expect(m("faite 2h").morceaux.map((x) => x.texte)).toEqual(["Faite", "2 h de travail"]);
  });
});

const r = (s: string) => analyserReunion(s, AUJ, P);

describe("noter une réunion depuis la barre", () => {
  it("« réunion » en tête : titre, projet, jour, heure, durée", () => {
    expect(estReunion("Réunion comité de pilotage")).toBe(true);
    expect(estReunion("réu : point hebdo")).toBe(true);
    expect(estReunion("Préparer la réunion")).toBe(false);
    expect(r("Réunion comité de pilotage UR jeudi 10h 1h30")).toMatchObject({ titre: "Comité de pilotage", projet: { id: "p-ur" }, jour: "2026-10-29", heure: "10:00", dureeMinutes: 90 });
  });
  it("par défaut : aujourd'hui, sans heure, une heure", () => {
    expect(r("Réunion point DTI")).toMatchObject({ titre: "Point DTI", jour: AUJ, heure: null, dureeMinutes: 60 });
  });
  it("le jour de la semaine en cours, passé ou à venir ; hier ; prochain, dernier", () => {
    expect(r("réunion x lundi").jour).toBe("2026-10-26");
    expect(r("réunion x vendredi").jour).toBe("2026-10-30");
    expect(r("réunion x hier").jour).toBe("2026-10-27");
    expect(r("réunion x lundi prochain").jour).toBe("2026-11-02");
    expect(r("réunion x vendredi dernier").jour).toBe("2026-10-23");
    expect(r("réunion x 12/10").jour).toBe("2026-10-12");
  });
  it("heures et durées sous toutes les formes", () => {
    expect(r("réunion x de 14h à 15h30")).toMatchObject({ heure: "14:00", dureeMinutes: 90, titre: "X" });
    expect(r("réunion x à 9h 45 min")).toMatchObject({ heure: "09:00", dureeMinutes: 45 });
    expect(r("réunion x 2h")).toMatchObject({ heure: null, dureeMinutes: 120 });
    expect(r("réunion x 14h30")).toMatchObject({ heure: "14:30", dureeMinutes: 60 });
    expect(r("réunion x pendant 3h")).toMatchObject({ dureeMinutes: 180 });
    expect(r("réunion x 900 min").dureeMinutes).toBe(60); // hors limites : durée par défaut
  });
  it("montre ce qui a été compris", () => {
    expect(r("Réunion revue UR mardi à 10h 1h").morceaux.map((m) => m.texte)).toEqual(["UR · Nouvelle version UNIBANKOnline Retail", "Mardi 27 octobre", "à 10 h", "1 h"]);
  });
});

describe("un jour de la semaine suivi d'une date (29 octobre 2026)", () => {
  it("la date l'emporte, et les deux mots sortent du titre", () => {
    const t = analyserSaisie("Relire les maquettes vendredi 6/11 2h", "2026-10-29", []);
    expect(t).toMatchObject({ titre: "Relire les maquettes", echeance: "2026-11-06", heures: 2 });
    expect(analyserSaisie("Envoyer le budget lundi 2 novembre", "2026-10-29", [])).toMatchObject({ titre: "Envoyer le budget", echeance: "2026-11-02" });
    const r = analyserReunion("Réunion point projet mardi 3/11 10h", "2026-10-30", []);
    expect(r).toMatchObject({ titre: "Point projet", jour: "2026-11-03", heure: "10:00" });
  });
  it("un jour seul garde son sens", () => {
    expect(analyserSaisie("Relire les maquettes vendredi", "2026-10-29", [])).toMatchObject({ titre: "Relire les maquettes", echeance: "2026-10-30" });
    expect(analyserReunion("Réunion revue mardi à 10h", "2026-10-30", [])).toMatchObject({ jour: "2026-10-27" });
  });
});
