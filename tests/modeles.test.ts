import { describe, expect, it } from "vitest";
import * as M from "@/lib/modeles";
import {
  additionnerComptes,
  champsManquants,
  comptesVides,
  deplier,
  FORMULAIRE_PAR_DEFAUT,
  nouveauChamp,
  pireSante,
  resoudreModele,
  ressentiPropose,
  texteComptes,
  validerChamps,
  valeurAcceptable,
  visibiliteDeLigne,
  voitVisibilite,
  type Champ,
} from "@/lib/modeles";

describe("validation des champs d'un modèle", () => {
  it("accepte le modèle par défaut tel quel", () => {
    const v = validerChamps(FORMULAIRE_PAR_DEFAUT, "individuel");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.champs.map((c) => c.id)).toEqual(["fait", "en_cours", "bloque", "prochaine"]);
  });

  it("retire ce qui n'est pas prévu et fixe les valeurs par défaut", () => {
    const v = validerChamps([{ id: "x", type: "lignes", libelle: "  Fait  ", pirate: true, rubrique: "inconnue" }], "individuel");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.champs[0]).toEqual({ id: "x", type: "lignes", libelle: "Fait", rubrique: "autre", prerempli: false, parProjet: true, visibilite: "tous" });
  });

  it("refuse les identifiants en double, les libellés vides, les choix sans options", () => {
    expect(validerChamps([{ id: "a", type: "texte", libelle: "A" }, { id: "a", type: "texte", libelle: "B" }], "individuel").ok).toBe(false);
    expect(validerChamps([{ id: "a", type: "texte", libelle: " " }], "individuel").ok).toBe(false);
    expect(validerChamps([{ id: "a", type: "choix", libelle: "A", options: ["seule"] }], "individuel").ok).toBe(false);
  });

  it("« Mon travail » et les reprises n'existent que dans un modèle de chef, une fois", () => {
    expect(validerChamps([{ id: "t", type: "mon_travail", libelle: "Mon travail" }], "individuel").ok).toBe(false);
    expect(validerChamps([{ id: "t", type: "mon_travail", libelle: "Mon travail" }], "chef").ok).toBe(true);
    expect(validerChamps([{ id: "t", type: "mon_travail", libelle: "A" }, { id: "u", type: "mon_travail", libelle: "B" }], "chef").ok).toBe(false);
    expect(validerChamps([{ id: "r", type: "reprise", libelle: "Repris" }], "chef").ok).toBe(false); // sans « reprise »
  });

  it("un champ neuf reçoit un identifiant libre", () => {
    const c = nouveauChamp("texte", ["question_courte"]);
    expect(c.id).toBe("question_courte_2");
    expect(c.visibilite).toBe("tous");
  });
});

describe("dépliage d'un modèle de chef", () => {
  const chef: Champ[] = [
    { id: "mon_travail", type: "mon_travail", libelle: "Mon travail" },
    { id: "equipe", type: "intertitre", libelle: "Mon équipe" },
    { id: "fait", type: "reprise", libelle: "Fait cette semaine", reprise: "fait", visibilite: "tous" },
  ];
  it("remplace « Mon travail » par le formulaire individuel, sans collision d'identifiants", () => {
    const f = deplier(chef, "chef", FORMULAIRE_PAR_DEFAUT);
    expect(f.map((c) => c.id)).toEqual(["mon_travail", "t_fait", "en_cours", "bloque", "prochaine", "equipe", "fait"]);
    expect(f[0].type).toBe("intertitre");
    expect(f.filter((c) => c.partie === "travail").length).toBe(5);
    expect(f.find((c) => c.id === "fait")?.partie).toBe("equipe");
  });
  it("un modèle individuel reste tel quel", () => {
    expect(deplier(FORMULAIRE_PAR_DEFAUT, "individuel", []).map((c) => c.id)).toEqual(FORMULAIRE_PAR_DEFAUT.map((c) => c.id));
  });
});

describe("quel modèle pour qui", () => {
  const M = [
    { id: "defaut", genre: "individuel" as const, parDefaut: true, pourChefs: false, actif: true },
    { id: "st", genre: "individuel" as const, parDefaut: false, pourChefs: false, actif: true },
    { id: "chef", genre: "chef" as const, parDefaut: false, pourChefs: true, actif: true },
    { id: "division", genre: "chef" as const, parDefaut: false, pourChefs: false, actif: true },
  ];
  const A = [
    { modeleId: "st", equipeId: "eq-st", personneId: null },
    { modeleId: "division", equipeId: null, personneId: "nadege" },
  ];
  it("membre d'une équipe affectée : le modèle de l'équipe", () => {
    expect(resoudreModele("daphnee", ["eq-st", "eq-dir"], false, M, A)).toEqual({ modeleId: "st", individuelId: "st" });
  });
  it("chef d'équipe : le modèle des chefs, et son équipe pour « Mon travail »", () => {
    expect(resoudreModele("marc", ["eq-st", "eq-dir"], true, M, A)).toEqual({ modeleId: "chef", individuelId: "st" });
  });
  it("affectation nominative d'abord", () => {
    expect(resoudreModele("nadege", ["eq-dir"], true, M, A)).toEqual({ modeleId: "division", individuelId: "defaut" });
  });
  it("sinon le modèle par défaut ; un modèle désactivé ne compte plus", () => {
    expect(resoudreModele("fabienne", ["eq-po"], false, M, A).modeleId).toBe("defaut");
    const sansSt = M.map((m) => (m.id === "st" ? { ...m, actif: false } : m));
    expect(resoudreModele("daphnee", ["eq-st"], false, sansSt, A).modeleId).toBe("defaut");
  });
});

describe("qui voit quoi, champ par champ", () => {
  it("« son supérieur seulement » : ni la direction, ni les chefs de projet", () => {
    expect(voitVisibilite("superieur", "superieur")).toBe(true);
    expect(voitVisibilite("direction", "superieur")).toBe(false);
    expect(voitVisibilite("chef_projet", "superieur")).toBe(false);
    expect(voitVisibilite("chef_projet", "direction")).toBe(false);
    expect(voitVisibilite("direction", "direction")).toBe(true);
    expect(voitVisibilite("chef_projet", "tous")).toBe(true);
  });
  it("un élément reçu à titre privé reste au chef, sauf s'il le fait remonter", () => {
    const champ = { visibilite: "tous" as const };
    expect(visibiliteDeLigne(champ, { visibilite: "auteur", remonte: false })).toBe("auteur");
    expect(voitVisibilite("superieur", "auteur")).toBe(false);
    expect(voitVisibilite("auteur", "auteur")).toBe(true);
    expect(visibiliteDeLigne(champ, { visibilite: "auteur", remonte: true })).toBe("tous");
    expect(visibiliteDeLigne(champ, { visibilite: null, remonte: false })).toBe("tous");
  });
});

describe("agrégats du rapport de chef", () => {
  it("le feu le plus préoccupant", () => {
    expect(pireSante(["dans_les_temps", "a_surveiller", null])).toBe("a_surveiller");
    expect(pireSante(["a_surveiller", "en_retard"])).toBe("en_retard");
    expect(pireSante([])).toBeNull();
  });
  it("la charge ne remonte qu'en nombres", () => {
    const a = comptesVides();
    a.calcule.surchargee = 2;
    a.ressenti.trop_lourde = 1;
    const b = comptesVides();
    b.calcule.normale = 3;
    b.ressenti.lourde = 1;
    const s = additionnerComptes(a, b);
    expect(s.calcule).toEqual({ libre: 0, normale: 3, chargee: 0, surchargee: 2 });
    expect(texteComptes(s)).toBe("2 surchargées, 3 normales ; 2 ressentis « lourde » ou plus");
    expect(ressentiPropose("chargee")).toBe("lourde");
  });
});

describe("champs obligatoires et valeurs", () => {
  const f: Champ[] = [
    { id: "fait", type: "lignes", libelle: "Fait", obligatoire: true },
    { id: "sante", type: "sante", libelle: "Santé", obligatoire: true },
    { id: "decision", type: "texte", libelle: "Décision" },
    { id: "titre", type: "intertitre", libelle: "Titre", obligatoire: true },
  ];
  it("liste ce qui manque", () => {
    const m = champsManquants(f, { lignes: new Map(), reponses: new Map([["sante", ["a_surveiller"]]]), projetsANoter: new Map([["sante", 2]]) });
    expect(m.map((c) => c.id)).toEqual(["fait", "sante"]);
    const ok = champsManquants(f, { lignes: new Map([["fait", 1]]), reponses: new Map([["sante", ["a_surveiller", "en_retard"]]]), projetsANoter: new Map([["sante", 2]]) });
    expect(ok).toEqual([]);
  });
  it("refuse une valeur hors de la liste", () => {
    expect(valeurAcceptable({ id: "c", type: "choix", libelle: "C", options: ["Oui", "Non"] }, "Peut-être")).toBeNull();
    expect(valeurAcceptable({ id: "s", type: "sante", libelle: "S" }, "en_retard")).toBe("en_retard");
    expect(valeurAcceptable({ id: "n", type: "nombre", libelle: "N" }, "12,5")).toBe("12.5");
    expect(valeurAcceptable({ id: "d", type: "date", libelle: "D" }, "2026-13-40")).toBeNull();
  });
});

describe("heures de la semaine", () => {
  const semaine = "2026-10-26";
  it("se valident dans l'ordre : prêt, rappel, limite", () => {
    expect(M.validerHoraires({ pret: { jour: 5, heure: "10:00" }, rappel: null, limite: { jour: 5, heure: "17:00" } }).ok).toBe(true);
    expect(M.validerHoraires({ pret: { jour: 5, heure: "14:00" }, rappel: { jour: 5, heure: "10:00" } }).ok).toBe(false);
    expect(M.validerHoraires({ pret: { jour: 9, heure: "10:00" } }).ok).toBe(false);
    expect(M.validerHoraires({ pret: { jour: 5, heure: "25:00" } }).ok).toBe(false);
    expect(M.horairesDe(null)).toEqual(M.HORAIRES_PAR_DEFAUT);
  });
  it("disent où en est la semaine", () => {
    const h = M.HORAIRES_PAR_DEFAUT; // vendredi 10 h, 14 h, 17 h
    expect(M.etapeRapport(h, semaine, { jour: "2026-10-29", minutes: 23 * 60 })).toBe("en_preparation");
    expect(M.etapeRapport(h, semaine, { jour: "2026-10-30", minutes: 10 * 60 })).toBe("pret");
    expect(M.etapeRapport(h, semaine, { jour: "2026-10-30", minutes: 15 * 60 })).toBe("rappel");
    expect(M.etapeRapport(h, semaine, { jour: "2026-10-30", minutes: 17 * 60 })).toBe("en_retard");
    expect(M.etapeRapport(h, semaine, { jour: "2026-11-02", minutes: 8 * 60 })).toBe("en_retard");
    expect(M.etapeRapport({ pret: h.pret, rappel: null, limite: { jour: 8, heure: "09:00" } }, semaine, { jour: "2026-11-01", minutes: 0 })).toBe("pret");
    expect(M.texteMoment({ jour: 5, heure: "16:30" }, semaine)).toBe("vendredi 30 oct. à 16 h 30");
  });
  it("la synthèse et la pièce jointe : la première seulement dans un modèle de chef", () => {
    expect(M.validerChamps([{ id: "s", type: "synthese", libelle: "Synthèse" }], "individuel").ok).toBe(false);
    const v = M.validerChamps([{ id: "p", type: "piece_jointe", libelle: "Pièces", obligatoire: true }], "individuel");
    expect(v.ok && v.champs[0].obligatoire).toBe(true);
    expect(M.champsManquants([{ id: "p", type: "piece_jointe", libelle: "Pièces", obligatoire: true }], { lignes: new Map(), reponses: new Map(), pieces: new Map() }).length).toBe(1);
    expect(M.champsManquants([{ id: "p", type: "piece_jointe", libelle: "Pièces", obligatoire: true }], { lignes: new Map(), reponses: new Map(), pieces: new Map([["p", 1]]) }).length).toBe(0);
  });
});
