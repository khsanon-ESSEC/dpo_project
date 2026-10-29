/**
 * Kit de démarrage (29 octobre 2026) : les règles tirées de la fiche du projet (type de solution, informations
 * disponibles, spécialisations), sans base.
 */
import { describe, expect, it } from "vitest";
import { cadrageDuFormulaire, cadrageValide, lignesCadrage } from "@/lib/cadrage";
import { kitDeDemarrage, tailleDuKit, type ExistantProjet } from "@/lib/kit";

const vide: ExistantProjet = { dateEntree: "2026-11-02", dateFinPrevue: "2027-04-30", phases: [], livrables: [], risques: [], benefices: [], placesBenefices: 12, equipe: ["chef"] };
const cles = (l: { cle: string }[]) => l.map((x) => x.cle);

describe("fiche du projet (cadrage)", () => {
  it("ne garde que les cases connues, dans l'ordre de la fiche", () => {
    expect(cadrageValide({ types: ["nouveau_processus", "inconnu", "amelioration_produit"], infos: "techniques", specialisations: ["deploiement", "solutions"] })).toEqual({
      types: ["amelioration_produit", "nouveau_processus"],
      infos: [],
      specialisations: ["solutions", "deploiement"],
    });
    expect(cadrageValide(null)).toBeNull();
  });
  it("un formulaire sans les cases ne change rien ; avec, tout décoché veut dire « aucune »", () => {
    const f = (o: Record<string, string[]>) => ({ get: (k: string) => o[k]?.[0] ?? null, getAll: (k: string) => o[k] ?? [] });
    expect(cadrageDuFormulaire(f({}))).toBeNull();
    expect(cadrageDuFormulaire(f({ cadrage: ["1"] }))).toEqual({ types: [], infos: [], specialisations: [] });
    expect(cadrageDuFormulaire(f({ cadrage: ["1"], "cadrage-type": ["nouveau_produit"], "cadrage-info": ["financieres"] }))).toEqual({ types: ["nouveau_produit"], infos: ["financieres"], specialisations: [] });
  });
  it("se lit en trois lignes", () => {
    expect(lignesCadrage({ types: ["amelioration_processus"], infos: [], specialisations: ["solutions", "deploiement"] })).toEqual([
      { rubrique: "Type de solution", valeur: "Amélioration de processus / procédures" },
      { rubrique: "Informations déjà disponibles", valeur: "Aucune" },
      { rubrique: "Spécialisations DPO impliquées", valeur: "Solutions Technologiques, Déploiement & Formation" },
    ]);
  });
});

describe("kit de démarrage", () => {
  it("sans fiche : les phases types et ce qui vaut pour tout projet", () => {
    const k = kitDeDemarrage(null, vide);
    expect(k.phases.map((p) => p.nom)).toEqual(["Cadrage", "Conception", "Réalisation", "Validation métier", "Déploiement", "Clôture"]);
    expect(k.phases[0].debut).toBe("2026-11-02");
    expect(k.phases[5].fin).toBe("2027-04-30");
    expect(cles(k.livrables)).toEqual(["note-cadrage", "bilan"]);
    expect(k.risques).toEqual([]);
    expect(k.benefices).toEqual([]);
  });

  it("amélioration de processus, Solutions technologiques et Déploiement, sans informations financières", () => {
    const k = kitDeDemarrage({ types: ["amelioration_processus"], infos: ["techniques", "organisationnelles"], specialisations: ["solutions", "deploiement"] }, vide);
    expect(cles(k.livrables)).toEqual(expect.arrayContaining(["budget", "processus-actuel", "processus-cible", "cahier-charges", "solution-prete", "procedure", "validation-metier", "formes", "mise-en-production", "procedure-diffusee"]));
    expect(cles(k.livrables)).not.toContain("infos-techniques");
    expect(cles(k.livrables)).not.toContain("offre");
    // Chaque livrable dit sa phase, sa date (la fin de la phase) et pourquoi il est là.
    const cdc = k.livrables.find((x) => x.cle === "cahier-charges")!;
    expect(cdc).toMatchObject({ phase: "Conception", prevuLe: k.phases[1].fin, raison: "spécialisation Solutions Technologiques" });
    expect(k.livrables.find((x) => x.cle === "budget")!.raison).toBe("informations financières pas encore disponibles");
    expect(cles(k.risques)).toEqual(expect.arrayContaining(["r-budget", "r-fournisseur", "r-securite", "r-metier", "r-changement", "r-formation"]));
    expect(cles(k.risques)).not.toContain("r-reglementaire");
    expect(cles(k.benefices)).toEqual(["b-delai", "b-erreurs", "b-manuel"]);
  });

  it("nouveau produit : conformité, offre, lancement et adoption", () => {
    const k = kitDeDemarrage({ types: ["nouveau_produit"], infos: ["techniques", "organisationnelles", "financieres"], specialisations: [] }, vide);
    expect(cles(k.livrables)).toEqual(["note-cadrage", "offre", "conformite", "lancement-produit", "bilan"]);
    expect(cles(k.risques)).toEqual(["r-reglementaire", "r-adoption"]);
    expect(cles(k.benefices)).toEqual(["b-clients"]);
  });

  it("ne repropose pas ce que le projet a déjà ; ses phases donnent les dates", () => {
    const ex: ExistantProjet = {
      ...vide,
      phases: [
        { nom: "Cadrage", debut: "2026-11-02", fin: "2026-11-20" },
        { nom: "Conception", debut: "2026-11-23", fin: "2026-12-18" },
      ],
      livrables: ["note de cadrage VALIDÉE"],
      risques: ["Le prestataire ou la DTI ne livre pas à temps"],
      benefices: ["Moins de travail manuel"],
    };
    const k = kitDeDemarrage({ types: [], infos: ["techniques", "organisationnelles", "financieres"], specialisations: ["solutions"] }, ex);
    expect(k.phases).toEqual([]);
    expect(cles(k.livrables)).not.toContain("note-cadrage");
    expect(k.livrables.find((x) => x.cle === "cahier-charges")!.prevuLe).toBe("2026-12-18");
    expect(k.livrables.find((x) => x.cle === "solution-prete")!.prevuLe).toBeNull(); // pas de phase « Réalisation » au projet
    expect(cles(k.risques)).not.toContain("r-fournisseur");
    expect(k.benefices).toEqual([]);
  });

  it("bénéfices : pas plus que les places restantes", () => {
    const k = kitDeDemarrage({ types: ["amelioration_processus", "nouveau_processus"], infos: [], specialisations: ["solutions"] }, { ...vide, placesBenefices: 2 });
    expect(k.benefices).toHaveLength(2);
  });

  it("personnes : le responsable de l'équipe qui porte le nom d'une spécialisation cochée, s'il n'est pas déjà dans l'équipe", () => {
    const equipes = [
      { nom: "Solutions technologiques", chefId: "ma", chefNom: "Marc-Antoine Louis" },
      { nom: "Organisation et méthodes", chefId: "om", chefNom: "Quelqu'un" },
    ];
    const c = { types: [], infos: ["techniques", "organisationnelles", "financieres"], specialisations: ["solutions", "deploiement"] } as const;
    const k = kitDeDemarrage({ ...c, types: [...c.types], infos: [...c.infos], specialisations: [...c.specialisations] }, vide, equipes);
    expect(k.personnes).toEqual([{ cle: "p-solutions", personneId: "ma", nom: "Marc-Antoine Louis", role: "Solutions technologiques", raison: "spécialisation Solutions Technologiques : responsable de l'équipe Solutions technologiques" }]);
    expect(kitDeDemarrage({ ...c, types: [], infos: [...c.infos], specialisations: ["solutions"] }, { ...vide, equipe: ["chef", "ma"] }, equipes).personnes).toEqual([]);
    expect(tailleDuKit(k)).toBe(1 + k.livrables.length + k.risques.length + k.benefices.length + 1);
  });
});
