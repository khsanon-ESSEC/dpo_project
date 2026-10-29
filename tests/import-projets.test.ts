import { describe, expect, it } from "vitest";
import { COLONNES_PROJETS, COLONNES_TACHES, lireCourriels, lireDate, lireHeures, lireOuiNon, lirePrioriteImport, lireStatutProjet, lireStatutTache, lireTableau } from "@/lib/import-projets";

describe("import en vrac : lecture du fichier", () => {
  it("reconnaît les colonnes à leur nom (ordre libre, accents et majuscules sans importance), saute les lignes vides", () => {
    const r = lireTableau(
      [
        ["Mode : import des projets"],
        ["TITRE", "code", "Chef de projet (courriel)", "Fin prévue (JJ/MM/AAAA)"],
        ["Portail fournisseurs", "pf", "Daphnee.Joseph@demo.dpo.local", "31/03/2027"],
        ["", "", "", ""],
        ["Archivage", "", "", ""],
      ],
      COLONNES_PROJETS,
      "titre",
    );
    expect(r).toMatchObject({ lignes: [{ ligne: 3, valeurs: { titre: "Portail fournisseurs", code: "pf", chef: "Daphnee.Joseph@demo.dpo.local", dateFinPrevue: "31/03/2027" } }, { ligne: 5 }] });
    expect(lireTableau([["Nom", "Prénom"]], COLONNES_TACHES, "titre")).toHaveProperty("erreur");
  });

  it("dates : JJ/MM/AAAA, JJ/MM/AA, AAAA-MM-JJ, date Excel ; refuse une date impossible", () => {
    expect(lireDate("31/03/2027")).toEqual({ date: "2027-03-31" });
    expect(lireDate("1/4/27")).toEqual({ date: "2027-04-01" });
    expect(lireDate("2027-03-31")).toEqual({ date: "2027-03-31" });
    expect(lireDate("46477")).toEqual({ date: "2027-03-31" });
    expect(lireDate("")).toEqual({ date: null });
    expect(lireDate("31/02/2027")).toHaveProperty("erreur");
    expect(lireDate("bientôt")).toHaveProperty("erreur");
  });

  it("statuts, priorités, oui/non, courriels, heures", () => {
    expect(lireStatutProjet("")).toBe("en_cours");
    expect(lireStatutProjet("Finalisé")).toBe("finalise");
    expect(lireStatutProjet("plus tard")).toBeNull();
    expect(lireStatutTache("À faire")).toBe("a_faire");
    expect(lireStatutTache("Bloquée")).toBe("bloquee");
    expect(lireStatutTache("terminée")).toBe("faite");
    expect(lirePrioriteImport("HAUTE")).toBe("haute");
    expect(lirePrioriteImport("urgente")).toBeNull();
    expect(lireOuiNon("Oui")).toBe(true);
    expect(lireOuiNon("")).toBe(false);
    expect(lireOuiNon("peut-être")).toBeNull();
    expect(lireCourriels("a@b.com; c@d.org ,a@b.com")).toEqual({ courriels: ["a@b.com", "c@d.org"] });
    expect(lireCourriels("a@b.com; pas un courriel")).toHaveProperty("erreur");
    expect(lireHeures("12,5")).toEqual({ heures: 13 });
    expect(lireHeures("0")).toHaveProperty("erreur");
  });
});
