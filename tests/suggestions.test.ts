import { describe, expect, it } from "vitest";
import { syntheseParRegles, suggestionsDecision } from "@/lib/suggestions";

describe("synthèse d'un projet, par règles", () => {
  it("regroupe par rubrique, sans doublon, trois éléments au plus", () => {
    const t = syntheseParRegles([
      { rubrique: "fait", texte: "Archives du 2e étage : 60 % transférées." },
      { rubrique: "fait", texte: "Numérisation des registres 2017" },
      { rubrique: "fait", texte: "archives du 2e étage : 60 % transférées" },
      { rubrique: "bloque", texte: "Scanner du 3e étage en panne" },
      { rubrique: "prochaine", texte: "Registres 2018" },
      { rubrique: "autre", texte: "Ne compte pas" },
    ]);
    expect(t).toBe("Fait : Archives du 2e étage : 60 % transférées ; Numérisation des registres 2017. À décider ou débloquer : Scanner du 3e étage en panne. Ensuite : Registres 2018.");
  });
  it("au-delà de trois, compte le reste", () => {
    const t = syntheseParRegles(["a", "b", "c", "d", "e"].map((x) => ({ rubrique: "en_cours", texte: x })));
    expect(t).toBe("En cours : a ; b ; c (et 2 autres).");
  });
  it("les synthèses des chefs d'équipe passent avant le détail", () => {
    expect(syntheseParRegles([{ rubrique: "fait", texte: "x" }], [{ qui: "Myriam", texte: "Tout va bien." }])).toBe("Myriam : Tout va bien.");
  });
});

describe("décisions ou aide à demander", () => {
  const jour = "2026-10-30";
  it("débloquer les tâches bloquées, arbitrer les échéances dépassées", () => {
    const s = suggestionsDecision(
      [
        { titre: "Recette Credos", statut: "bloquee", blocage: "Serveur de recette demandé à la DTI.", echeance: "2026-11-06", projetCode: "CR" },
        { titre: "Plan de migration", statut: "en_cours", blocage: null, echeance: "2026-10-26", projetCode: "UN" },
        { titre: "Déjà faite", statut: "faite", blocage: null, echeance: "2026-10-01" },
        { titre: "Pas en retard", statut: "a_faire", blocage: null, echeance: "2026-11-02" },
      ],
      ["Recette Credos : serveur de recette demandé à la DTI", "Date de la phase pilote : le Réseau n'a pas répondu"],
      jour,
    );
    expect(s).toEqual([
      "CR · Débloquer « Recette Credos » : Serveur de recette demandé à la DTI.",
      "Débloquer : Date de la phase pilote : le Réseau n'a pas répondu.",
      "UN · Arbitrer l'échéance de « Plan de migration » : prévue le 26 oct., 4 jours de retard.",
    ]);
  });
  it("ne propose pas ce qui est déjà écrit", () => {
    const s = suggestionsDecision([{ titre: "Recette Credos", statut: "bloquee", blocage: null, echeance: null }], [], jour, ["Débloquer « Recette Credos »."]);
    expect(s).toEqual([]);
  });
});
