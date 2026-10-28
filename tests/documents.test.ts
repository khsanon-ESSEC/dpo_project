import { describe, expect, it } from "vitest";
import { categorieDevinee, estCategorie } from "@/lib/documents";

describe("documents d'un projet", () => {
  it("la catégorie se devine au nom du fichier", () => {
    expect(categorieDevinee("CDC_recrutement_v2.docx")).toBe("cahier_des_charges");
    expect(categorieDevinee("Cahier des charges - Plateforme.pdf")).toBe("cahier_des_charges");
    expect(categorieDevinee("Spécifications techniques API.pdf")).toBe("specification");
    expect(categorieDevinee("SFD module candidatures.docx")).toBe("specification");
    expect(categorieDevinee("CR comité de pilotage 2026-10-29.docx")).toBe("compte_rendu");
    expect(categorieDevinee("Compte-rendu réunion DRH.pdf")).toBe("compte_rendu");
    expect(categorieDevinee("budget.xlsx")).toBe("autre");
    // « cr » au milieu d'un mot n'est pas un compte rendu.
    expect(categorieDevinee("ecran_accueil.png")).toBe("autre");
  });
  it("seules les catégories connues passent", () => {
    expect(estCategorie("compte_rendu")).toBe(true);
    expect(estCategorie("__proto__")).toBe(false);
    expect(estCategorie("toString")).toBe(false);
    expect(estCategorie(null)).toBe(false);
  });
});
