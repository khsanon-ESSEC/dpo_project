import { describe, expect, it } from "vitest";
import { bilanDesObjectifs, estMesurable, objectifsDuTexte, peutNoterConstat, texteMesure, validerObjectif } from "@/lib/objectifs";
import { memeRaci, nomsDuRole, RACI_DPO, validerRaci } from "@/lib/raci";
import { categorieDevinee } from "@/lib/documents";

describe("objectifs et bénéfices", () => {
  it("un objectif : une phrase, majuscule initiale ; trop court, refusé", () => {
    expect(validerObjectif("objectif", { libelle: "  optimiser   les processus " })).toEqual({ valeurs: { libelle: "Optimiser les processus", indicateur: "", depart: "", cible: "" } });
    expect(validerObjectif("objectif", { libelle: "ok" })).toHaveProperty("erreur");
    // Un objectif ne garde pas d'indicateur.
    expect(validerObjectif("objectif", { libelle: "Former les agents", indicateur: "x", cible: "y" })).toMatchObject({ valeurs: { indicateur: "", cible: "" } });
  });
  it("un bénéfice : valeurs sans indicateur refusées ; mesurable avec indicateur et cible", () => {
    expect(validerObjectif("benefice", { libelle: "Moins d'attente", depart: "48 h" })).toHaveProperty("erreur");
    const v = validerObjectif("benefice", { libelle: "moins d'attente", indicateur: "délai moyen", depart: "48 h", cible: "24 h" });
    expect(v).toEqual({ valeurs: { libelle: "Moins d'attente", indicateur: "Délai moyen", depart: "48 h", cible: "24 h" } });
    if ("valeurs" in v) {
      expect(estMesurable(v.valeurs)).toBe(true);
      expect(texteMesure(v.valeurs)).toBe("Délai moyen : 48 h → 24 h");
    }
    expect(estMesurable({ indicateur: "NPS", cible: "" })).toBe(false);
    expect(texteMesure({ indicateur: "NPS", depart: "", cible: "+25" })).toBe("NPS : cible +25");
    expect(texteMesure({ indicateur: "", depart: "1", cible: "2" })).toBe("");
  });
  it("le bilan d'ensemble se tire des objectifs", () => {
    expect(bilanDesObjectifs(["oui", "oui"])).toBe("oui");
    expect(bilanDesObjectifs(["non", "non"])).toBe("non");
    expect(bilanDesObjectifs(["oui", "non"])).toBe("en_partie");
    expect(bilanDesObjectifs(["en_partie"])).toBe("en_partie");
    expect(bilanDesObjectifs([])).toBeNull();
  });
  it("la valeur constatée se note sur un projet en cours ou finalisé, pas archivé ni en demande", () => {
    expect(peutNoterConstat({ statut: "finalise", archiveLe: null })).toBe(true);
    expect(peutNoterConstat({ statut: "en_cours", archiveLe: null })).toBe(true);
    expect(peutNoterConstat({ statut: "finalise", archiveLe: new Date() })).toBe(false);
    expect(peutNoterConstat({ statut: "requete", archiveLe: null })).toBe(false);
  });
  it("les objectifs d'une demande : un par ligne, puces et numéros retirés, 12 au plus", () => {
    expect(objectifsDuTexte("o Optimiser les processus\n- former les agents\n\n2) Mettre des KPI\n•   x\n")).toEqual(["Optimiser les processus", "Former les agents", "Mettre des KPI"]);
    expect(objectifsDuTexte(Array.from({ length: 20 }, (_, i) => `Objectif ${i}`).join("\n"))).toHaveLength(12);
    expect(objectifsDuTexte(null)).toEqual([]);
  });
});

describe("RACI", () => {
  it("le RACI type de la DPO est valide, sans avertissement", () => {
    const v = validerRaci(RACI_DPO);
    expect(v).toEqual({ raci: RACI_DPO, avertissements: [] });
  });
  it("un seul A par activité ; lettres R, A, C, I seulement ; activité nommée", () => {
    const base = { colonnes: [{ libelle: "Métier", qui: "sponsor" }, { libelle: "Chef", qui: "chef" }] };
    expect(validerRaci({ ...base, lignes: [{ activite: "Valider", lettres: ["A", "A"] }] })).toEqual({ erreur: "« Valider » : un seul rôle approuve (A)." });
    expect(validerRaci({ ...base, lignes: [{ activite: "Valider", lettres: ["A", "X"] }] })).toHaveProperty("erreur");
    expect(validerRaci({ ...base, lignes: [{ activite: "", lettres: ["A", "R"] }] })).toHaveProperty("erreur");
    expect(validerRaci({ ...base, lignes: [{ activite: "Valider", lettres: ["a", "r"] }] })).toMatchObject({ raci: { lignes: [{ lettres: ["A", "R"] }] } });
  });
  it("une ligne vide est ignorée ; une activité sans R ou sans A est signalée, pas refusée", () => {
    const v = validerRaci({ colonnes: [{ libelle: "Métier", qui: "sponsor" }], lignes: [{ activite: "", lettres: [""] }, { activite: "Informer", lettres: ["I"] }] });
    expect(v).toMatchObject({ raci: { lignes: [{ activite: "Informer" }] } });
    if ("avertissements" in v) expect(v.avertissements).toEqual(["« Informer » : personne ne réalise (R).", "« Informer » : personne n'approuve (A)."]);
  });
  it("limites : un rôle au moins, six au plus ; pas d'activité en double ; un rôle inconnu devient « libre »", () => {
    expect(validerRaci({ colonnes: [], lignes: [{ activite: "x y", lettres: [] }] })).toHaveProperty("erreur");
    expect(validerRaci({ colonnes: Array.from({ length: 7 }, (_, i) => ({ libelle: `R${i}x`, qui: "libre" })), lignes: [] })).toHaveProperty("erreur");
    expect(validerRaci({ colonnes: [{ libelle: "Métier", qui: "sponsor" }], lignes: [{ activite: "Valider", lettres: ["A"] }, { activite: "valider", lettres: ["A"] }] })).toHaveProperty("erreur");
    expect(validerRaci({ colonnes: [{ libelle: "Métier", qui: "pirate" }], lignes: [{ activite: "Valider", lettres: ["A"] }] })).toMatchObject({ raci: { colonnes: [{ qui: "libre" }] } });
    expect(validerRaci("{pas du json")).toHaveProperty("erreur");
  });
  it("les noms sous chaque rôle", () => {
    const p = { sponsor: "Frantz Desrosiers", chef: "Myriam Valcin", referent: null, equipe: ["A", "B", "C", "D", "E"] };
    expect(nomsDuRole("sponsor", p)).toBe("Frantz Desrosiers");
    expect(nomsDuRole("chef", { ...p, referent: "Ludovic Pierre" })).toBe("Myriam Valcin, Ludovic Pierre (référent DPO)");
    expect(nomsDuRole("equipe", p)).toBe("A, B, C et 2 autres");
    expect(nomsDuRole("sponsor", { ...p, sponsor: null })).toBe("Sponsor à désigner");
    expect(nomsDuRole("libre", p)).toBe("");
    expect(memeRaci(RACI_DPO, JSON.parse(JSON.stringify(RACI_DPO)))).toBe(true);
  });
  it("la note de cadrage se reconnaît au nom du fichier", () => {
    expect(categorieDevinee("Note de cadrage - Centre de contact.docx")).toBe("note_de_cadrage");
    expect(categorieDevinee("NDC_centre_contact_v3.pdf")).toBe("note_de_cadrage");
    expect(categorieDevinee("Fiche projet UR.pdf")).toBe("note_de_cadrage");
  });
});
