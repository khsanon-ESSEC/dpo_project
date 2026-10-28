import { describe, expect, it } from "vitest";
import { analyserSaisie } from "@/lib/saisie-rapide";

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
