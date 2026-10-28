import { describe, expect, it } from "vitest";
import { cleNom, codeSuggere, codeValide, dureeTexte, dureeValide, peutAssigner, peutDecider, peutGererProjet, projetOuvert, projetSupprimable, responsableId, separerNom, tacheSupprimable, verifierChefEtReferent, type Acteur } from "@/lib/projets";

const chef: Acteur = { moiId: "chef", suivis: new Set(["chef", "a", "b"]), projetsDiriges: new Set(["P1"]), directeur: false, toutVoir: false };
const employe: Acteur = { moiId: "e", suivis: new Set(["e"]), projetsDiriges: new Set(), directeur: false, toutVoir: false };
const executif: Acteur = { moiId: "x", suivis: "toutes", projetsDiriges: new Set(), directeur: false, toutVoir: true };
const P1 = { id: "P1", chefProjetId: "chef", membres: new Set(["m"]) };
const P2 = { id: "P2", chefProjetId: "autre", membres: new Set(["m"]) };

describe("code de projet", () => {
  it("prend les initiales des mots qui comptent", () => {
    expect(codeSuggere("Tableau de bord des délais", [])).toBe("TBD");
    expect(codeSuggere("Refonte Credos", [])).toBe("RC");
    expect(codeSuggere("Nouvelle version UNIBANKOnline Retail", [])).toBe("VUR");
  });
  it("évite les codes déjà pris", () => {
    expect(codeSuggere("Refonte Credos", ["RC"])).toBe("RC2");
    expect(codeSuggere("Refonte Credos", ["rc", "RC2"])).toBe("RC3");
  });
  it("un mot seul donne ses deux premières lettres", () => {
    expect(codeSuggere("Archivage", [])).toBe("AR");
  });
  it("valide 2 à 4 lettres ou chiffres", () => {
    expect(codeValide(" ur ")).toBe("UR");
    expect(codeValide("UR2")).toBe("UR2");
    expect(codeValide("U")).toBeNull();
    expect(codeValide("ABCDE")).toBeNull();
    expect(codeValide("U-R")).toBeNull();
  });
});

describe("qui confie une tâche à qui", () => {
  it("chacun se confie une tâche, et en confie aux personnes qu'il suit", () => {
    expect(peutAssigner(employe, "e", null)).toBe(true);
    expect(peutAssigner(employe, "a", null)).toBe(false);
    expect(peutAssigner(chef, "a", null)).toBe(true);
    expect(peutAssigner(executif, "n'importe qui", P2)).toBe(true);
  });
  it("le chef de projet confie des tâches aux membres de son équipe projet, sur son projet seulement", () => {
    expect(peutAssigner(chef, "m", P1)).toBe(true);
    expect(peutAssigner(chef, "m", P2)).toBe(false);
    expect(peutAssigner(chef, "m", null)).toBe(false);
    expect(peutAssigner(chef, "inconnu", P1)).toBe(false);
  });
});

describe("gérer et décider", () => {
  it("le chef du projet, le directeur de sa direction et les exécutifs gèrent un projet accepté", () => {
    expect(peutGererProjet(chef, { chefProjetId: "chef", statut: "en_cours" })).toBe(true);
    expect(peutGererProjet(employe, { chefProjetId: "chef", statut: "en_cours" })).toBe(false);
    expect(peutGererProjet({ ...employe, directeur: true, suivis: new Set(["e", "chef"]) }, { chefProjetId: "chef" })).toBe(true);
    expect(peutGererProjet(executif, { chefProjetId: "chef" })).toBe(true);
  });
  it("un directeur ne gère pas le projet d'une autre direction, même si l'un des siens y travaille", () => {
    expect(peutGererProjet({ ...employe, directeur: true, suivis: new Set(["e", "a"]) }, { chefProjetId: "chef" })).toBe(false);
    expect(peutGererProjet({ ...employe, directeur: true, suivis: new Set(["e", "a"]) }, { chefProjetId: "chef", statut: "requete", demandeParId: "a" })).toBe(true);
  });
  it("une demande se corrige par son auteur, pas par le chef suggéré", () => {
    expect(peutGererProjet(employe, { chefProjetId: "chef", statut: "requete", demandeParId: "e" })).toBe(true);
    expect(peutGererProjet(chef, { chefProjetId: "chef", statut: "requete", demandeParId: "e" })).toBe(false);
  });
  it("seuls les directeurs et les exécutifs décident d'une demande", () => {
    expect(peutDecider(employe)).toBe(false);
    expect(peutDecider(chef)).toBe(false);
    expect(peutDecider({ directeur: true, toutVoir: false })).toBe(true);
    expect(peutDecider(executif)).toBe(true);
  });
  it("un projet reçoit des tâches s'il est accepté, en vie et pas archivé", () => {
    expect(projetOuvert({ statut: "en_cours", archiveLe: null })).toBe(true);
    expect(projetOuvert({ statut: "en_attente", archiveLe: null })).toBe(true);
    expect(projetOuvert({ statut: "requete", archiveLe: null })).toBe(false);
    expect(projetOuvert({ statut: "refuse", archiveLe: null })).toBe(false);
    expect(projetOuvert({ statut: "finalise", archiveLe: null })).toBe(false);
    expect(projetOuvert({ statut: "en_cours", archiveLe: new Date() })).toBe(false);
  });
});

describe("supprimer ou garder la trace", () => {
  it("une tâche sans histoire se supprime ; sinon on l'annule", () => {
    expect(tacheSupprimable({ statut: "a_faire", evenements: ["creation"], lignesRapport: 0 })).toBe(true);
    expect(tacheSupprimable({ statut: "a_faire", evenements: [], lignesRapport: 0 })).toBe(true);
    expect(tacheSupprimable({ statut: "faite", evenements: ["creation"], lignesRapport: 0 })).toBe(false);
    expect(tacheSupprimable({ statut: "en_cours", evenements: ["creation", "statut"], lignesRapport: 0 })).toBe(false);
    expect(tacheSupprimable({ statut: "a_faire", evenements: ["creation"], lignesRapport: 1 })).toBe(false);
  });
  it("un projet sans rien se supprime ; sinon on l'archive", () => {
    const vide = { taches: 0, lignesRapport: 0, reponsesRapport: 0, lignesConseil: 0, historique: 0, reunions: 0 };
    expect(projetSupprimable(vide)).toBe(true);
    expect(projetSupprimable({ ...vide, taches: 1 })).toBe(false);
    expect(projetSupprimable({ ...vide, reunions: 2 })).toBe(false);
  });
});

describe("durées de réunion", () => {
  it("s'écrivent simplement", () => {
    expect(dureeTexte(45)).toBe("45 min");
    expect(dureeTexte(60)).toBe("1 h");
    expect(dureeTexte(90)).toBe("1 h 30");
    expect(dureeTexte(125)).toBe("2 h 05");
  });
  it("vont de 5 minutes à 10 heures", () => {
    expect(dureeValide("30")).toBe(30);
    expect(dureeValide(4)).toBeNull();
    expect(dureeValide(601)).toBeNull();
    expect(dureeValide("abc")).toBeNull();
  });
});

describe("personnes hors division et projets d'autres divisions", () => {
  const directeur: Acteur = { ...employe, moiId: "d", directeur: true };
  it("seul le chef du projet confie une tâche à une personne hors division, et sur son projet", () => {
    expect(peutAssigner(chef, "ext", P1, true)).toBe(true);
    expect(peutAssigner(chef, "ext", P2, true)).toBe(false);
    expect(peutAssigner(chef, "ext", null, true)).toBe(false); // pas hors projet
    expect(peutAssigner(employe, "ext", null, true)).toBe(false);
    expect(peutAssigner(directeur, "ext", P2, true)).toBe(false);
    expect(peutAssigner(executif, "ext", P2, true)).toBe(false);
    // Une personne hors division avec un accès limité se confie ses propres tâches.
    expect(peutAssigner({ ...employe, moiId: "ext" }, "ext", null, true)).toBe(true);
  });
  it("le référent DPO a les droits de chef de projet ; c'est lui qui lit les lignes du projet", () => {
    const projet = { chefProjetId: "externe", referentId: "r", statut: "en_cours" };
    expect(responsableId(projet)).toBe("r");
    expect(responsableId({ chefProjetId: "c" })).toBe("c");
    expect(peutGererProjet({ ...employe, moiId: "r" }, projet)).toBe(true);
    expect(peutGererProjet(employe, projet)).toBe(false);
    // Le chef hors division ne gère pas le projet dans l'application : c'est son référent.
    expect(peutGererProjet({ ...employe, moiId: "externe" }, projet)).toBe(false);
    expect(peutAssigner({ ...employe, moiId: "r", projetsDiriges: new Set(["P3"]) }, "r2", { id: "P3", chefProjetId: "externe", referentId: "r", membres: new Set(["r2"]) })).toBe(true);
  });
  it("un chef hors division demande un référent de la DPO", () => {
    expect(verifierChefEtReferent({ externe: true }, null)).toMatch(/référent/);
    expect(verifierChefEtReferent({ externe: true }, { externe: false })).toBeNull();
    expect(verifierChefEtReferent({ externe: false }, null)).toBeNull();
    expect(verifierChefEtReferent({ externe: false }, { externe: true })).toMatch(/DPO/);
  });
  it("un nom saisi d'un bloc se range en prénom et nom, et se compare sans accents ni casse", () => {
    expect(separerNom("  Mireille   Saint-Fort ")).toEqual({ prenom: "Mireille", nom: "Saint-Fort" });
    expect(separerNom("Jonas")).toEqual({ prenom: "Jonas", nom: "" });
    expect(separerNom("   ")).toBeNull();
    expect(cleNom("Nathalie CÉLESTIN")).toBe(cleNom("nathalie  celestin"));
  });
});
