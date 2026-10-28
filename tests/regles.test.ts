import { describe, expect, it } from "vitest";
import { libellesRoles, membresDeLaDirection, peutVoirLigneCommeChefDeProjet, peutVoirRapportComplet, personnesSuivies, resoudreSuperieur, subordonnesDirects, type EquipeOrg, type OrgDonnees, type PersonneOrg, peutAdministrer, peutModifierRapportConseil } from "@/lib/regles";

/**
 * Organisation de test :
 *   ex (exécutif)
 *   └─ na (directrice de la division)
 *      ├─ ml (directeur, équipe st) ── dj, lp, jn (admin)
 *      ├─ mv (cheffe d'équipe po) ── fm
 *      └─ équipe om, poste vacant ── gp (remonte à na)
 */
function personne(id: string, equipeId: string | null, superieurId: string | null, roles: Partial<PersonneOrg> = {}): PersonneOrg {
  return { id, prenom: id, nom: id.toUpperCase(), poste: "", courriel: `${id}@x`, equipeId, superieurId, actif: true, directeur: false, executif: false, administrateur: false, externe: false, organisation: "", acces: true, ...roles };
}
function equipe(id: string, chefId: string | null, equipeParenteId: string | null): EquipeOrg {
  return { id, nom: id, chefId, equipeParenteId };
}
function org(): OrgDonnees {
  const personnes = [
    personne("ex", null, null, { executif: true }),
    personne("na", "dir", "ex", { directeur: true, administrateur: true }),
    personne("ml", "st", "na", { directeur: true }),
    personne("dj", "st", "ml"),
    personne("lp", "st", "ml"),
    personne("jn", "st", "ml", { administrateur: true }),
    personne("mv", "po", "na"),
    personne("fm", "po", "mv"),
    personne("gp", "om", null),
  ];
  const equipes = [equipe("dir", "na", null), equipe("st", "ml", "dir"), equipe("po", "mv", "dir"), equipe("om", null, "dir")];
  return { personnes: new Map(personnes.map((p) => [p.id, p])), equipes: new Map(equipes.map((e) => [e.id, e])) };
}
const moi = (o: OrgDonnees, id: string) => o.personnes.get(id)!;
const envoye = (auteurId: string, destinataireId: string | null = null) => ({ auteurId, destinataireId, statut: "envoye" as const });

describe("supérieur effectif", () => {
  it("prend le supérieur désigné", () => {
    expect(resoudreSuperieur(org(), "dj")?.id).toBe("ml");
  });
  it("remonte au niveau suivant quand le poste de responsable est vacant", () => {
    expect(resoudreSuperieur(org(), "gp")?.id).toBe("na");
  });
  it("saute un supérieur désactivé", () => {
    const o = org();
    o.personnes.get("ml")!.actif = false;
    expect(resoudreSuperieur(o, "dj")?.id).toBe("na");
  });
  it("ne renvoie jamais la personne elle-même", () => {
    expect(resoudreSuperieur(org(), "ex")).toBeNull();
    expect(resoudreSuperieur(org(), "na")?.id).toBe("ex");
  });
  it("donne à chacun un seul destinataire pour le rapport du vendredi", () => {
    const o = org();
    expect(subordonnesDirects(o, "ml").map((p) => p.id).sort()).toEqual(["dj", "jn", "lp"]);
    expect(subordonnesDirects(o, "na").map((p) => p.id).sort()).toEqual(["gp", "ml", "mv"]);
  });
});

describe("qui voit qui", () => {
  it("un exécutif voit tout le monde", () => {
    expect(personnesSuivies(org(), moi(org(), "ex"))).toBe("toutes");
  });
  it("un directeur voit sa direction, à tous les niveaux, et rien d'autre", () => {
    const o = org();
    expect([...(personnesSuivies(o, moi(o, "ml")) as Set<string>)].sort()).toEqual(["dj", "jn", "lp", "ml"]);
    const na = personnesSuivies(o, moi(o, "na")) as Set<string>;
    expect(na.has("fm")).toBe(true);
    expect(na.has("dj")).toBe(true);
    expect(na.has("ex")).toBe(false);
  });
  it("un chef d'équipe sans rôle de directeur ne voit que ses subordonnés directs", () => {
    const o = org();
    o.personnes.set("x", personne("x", "po", "fm"));
    expect([...(personnesSuivies(o, moi(o, "mv")) as Set<string>)].sort()).toEqual(["fm", "mv"]);
  });
  it("le rôle d'administrateur n'ouvre pas les rapports des autres", () => {
    const o = org();
    expect([...(personnesSuivies(o, moi(o, "jn")) as Set<string>)]).toEqual(["jn"]);
    expect(peutVoirRapportComplet(o, moi(o, "jn"), envoye("dj"))).toBe(false);
  });
  it("le directeur d'une autre direction ne voit pas le rapport", () => {
    const o = org();
    expect(peutVoirRapportComplet(o, moi(o, "ml"), envoye("fm"))).toBe(false);
    expect(peutVoirRapportComplet(o, moi(o, "na"), envoye("fm"))).toBe(true);
    expect(peutVoirRapportComplet(o, moi(o, "ex"), envoye("fm"))).toBe(true);
  });
  it("un brouillon reste à son auteur, même pour un exécutif", () => {
    const o = org();
    const brouillon = { auteurId: "dj", destinataireId: null, statut: "brouillon" as const };
    expect(peutVoirRapportComplet(o, moi(o, "dj"), brouillon)).toBe(true);
    expect(peutVoirRapportComplet(o, moi(o, "ml"), brouillon)).toBe(false);
    expect(peutVoirRapportComplet(o, moi(o, "ex"), brouillon)).toBe(false);
  });
  it("le destinataire désigné voit le rapport envoyé", () => {
    const o = org();
    expect(peutVoirRapportComplet(o, moi(o, "mv"), envoye("dj", "mv"))).toBe(true);
  });
  it("le chef de projet ne voit que les lignes envoyées de son projet", () => {
    expect(peutVoirLigneCommeChefDeProjet("mv", envoye("dj"), { projetChefId: "mv" })).toBe(true);
    expect(peutVoirLigneCommeChefDeProjet("mv", envoye("dj"), { projetChefId: "lp" })).toBe(false);
    expect(peutVoirLigneCommeChefDeProjet("mv", { auteurId: "dj", destinataireId: null, statut: "brouillon" }, { projetChefId: "mv" })).toBe(false);
  });
  it("une direction ne boucle pas même si les données en contiennent une", () => {
    const o = org();
    o.personnes.get("na")!.superieurId = "dj";
    expect(() => membresDeLaDirection(o, "na")).not.toThrow();
  });
});

describe("rôles cumulables", () => {
  it("affiche les rôles réglés à la main et ceux qui se déduisent", () => {
    expect(libellesRoles({ directeur: true, executif: false, administrateur: true, nbRapports: 3, nbProjetsDiriges: 1 })).toEqual([
      "Chef d'équipe",
      "Chef de projet",
      "Directeur",
      "Administrateur",
    ]);
    expect(libellesRoles({ directeur: false, executif: true, administrateur: false, nbRapports: 0, nbProjetsDiriges: 0 })).toEqual(["Exécutif"]);
  });
});

describe("rapport au conseil et administration", () => {
  const ponctuel = { genre: "ponctuel", statut: "brouillon", creeParId: "auteur" };
  it("un rapport ponctuel ne se modifie que par son auteur ou un exécutif", () => {
    expect(peutModifierRapportConseil({ moiId: "auteur", toutVoir: false }, ponctuel)).toBe(true);
    expect(peutModifierRapportConseil({ moiId: "autre-directeur", toutVoir: false }, ponctuel)).toBe(false);
    expect(peutModifierRapportConseil({ moiId: "exec", toutVoir: true }, ponctuel)).toBe(true);
    expect(peutModifierRapportConseil({ moiId: "auteur", toutVoir: false }, { ...ponctuel, statut: "approuve" })).toBe(false);
    expect(peutModifierRapportConseil({ moiId: "directeur", toutVoir: false }, { genre: "mensuel", statut: "brouillon", creeParId: null })).toBe(true);
  });
  it("une personne hors division n'administre jamais", () => {
    expect(peutAdministrer({ administrateur: true })).toBe(true);
    expect(peutAdministrer({ administrateur: true, externe: true })).toBe(false);
  });
});
