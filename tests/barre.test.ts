import { describe, expect, it } from "vitest";
import { analyserLigne, analyserMajProjet, analyserNote, analyserQuestion, genreDe, personneNommee, projetEnTete, projetNomme, reconnaitreMots, rubriqueDeNote } from "@/lib/barre";
import { analyserMiseAJour } from "@/lib/saisie-rapide";

const AUJ = "2026-10-28"; // mercredi
const P = [
  { id: "p-ur", code: "UR", titre: "Nouvelle version UNIBANKOnline Retail" },
  { id: "p-uc", code: "UC", titre: "Nouvelle version UNIBANKOnline Corporate" },
  { id: "p-cr", code: "CR", titre: "Refonte Credos" },
];
const G = [
  { id: "fm", nom: "Fabienne Michel" },
  { id: "dj", nom: "Daphnée Joseph" },
  { id: "mv", nom: "Myriam Valcin" },
  { id: "jn", nom: "Jean-Robert Noël" },
  { id: "jd", nom: "Joël Dorval" },
  { id: "mj", nom: "Marie Joseph" },
];

describe("notes pour le rapport", () => {
  it("le deux-points distingue une note d'une tâche", () => {
    expect(rubriqueDeNote("Décision : budget DTI")).toBe("decision");
    expect(rubriqueDeNote("Risque: recette repoussée")).toBe("bloque");
    expect(rubriqueDeNote("Fait marquant : pilote réussi")).toBe("fait");
    expect(rubriqueDeNote("Semaine prochaine : démo")).toBe("prochaine");
    expect(rubriqueDeNote("Fait le point avec la DTI")).toBeNull();
    expect(rubriqueDeNote("Décider du prestataire")).toBeNull();
  });
  it("texte et projet", () => {
    expect(analyserNote("Décision : valider le budget DTI UR avant le 15", P)).toEqual({ rubrique: "decision", texte: "Valider le budget DTI avant le 15", projet: P[0] });
    expect(analyserNote("risque : recette repoussée", P)).toMatchObject({ rubrique: "bloque", texte: "Recette repoussée", projet: null });
  });
});

describe("mettre à jour un projet", () => {
  it("santé et motif", () => {
    expect(analyserMajProjet("à surveiller : retard du prestataire", AUJ)).toEqual({ genre: "sante", sante: "a_surveiller", motif: "Retard du prestataire" });
    expect(analyserMajProjet("en retard car la recette a glissé", AUJ)).toEqual({ genre: "sante", sante: "en_retard", motif: "La recette a glissé" });
    expect(analyserMajProjet("dans les temps", AUJ)).toEqual({ genre: "sante", sante: "dans_les_temps", motif: "" });
  });
  it("jalon, fin et lancement prévus", () => {
    expect(analyserMajProjet("jalon recette 15/11", AUJ)).toEqual({ genre: "jalon", libelle: "Recette", prevuLe: "2026-11-15" });
    expect(analyserMajProjet("jalon validation métier 15/11", AUJ)).toEqual({ genre: "jalon", libelle: "Validation métier", prevuLe: "2026-11-15" });
    expect(analyserMajProjet("jalon : mise en production", AUJ)).toEqual({ genre: "jalon", libelle: "Mise en production", prevuLe: null });
    expect(analyserMajProjet("livrable modèle conceptuel validé 20/11", AUJ)).toEqual({ genre: "jalon", libelle: "Modèle conceptuel validé", prevuLe: "2026-11-20" });
    expect(analyserMajProjet("fin prévue 20/12", AUJ)).toEqual({ genre: "fin", date: "2026-12-20" });
    expect(analyserMajProjet("lancement 5 janvier", AUJ)).toEqual({ genre: "lancement", date: "2027-01-05" });
    expect(analyserMajProjet("fin prévue bientôt", AUJ)).toBeNull();
    expect(analyserMajProjet("Relire maquettes", AUJ)).toBeNull();
  });
  it("le code en tête suffit", () => {
    expect(projetEnTete("UR à surveiller : retard", P, AUJ)?.projet.id).toBe("p-ur");
    expect(projetEnTete("UR relire", P, AUJ)).toBeNull();
  });
});

describe("questions", () => {
  it("le sujet, les miennes, la période, le projet, la personne", () => {
    expect(analyserQuestion("en retard sur UR ?", AUJ)).toMatchObject({ sujet: "retard", projetCode: "UR", miennes: false });
    expect(analyserQuestion("qui est surchargé cette semaine ?", AUJ)).toMatchObject({ sujet: "charge" });
    expect(analyserQuestion("mes échéances de la semaine prochaine ?", AUJ)).toMatchObject({ sujet: "echeances", miennes: true, periode: { debut: "2026-11-02", fin: "2026-11-08" } });
    expect(analyserQuestion("qui n'a pas envoyé son rapport ?", AUJ)).toMatchObject({ sujet: "rapports" });
    expect(analyserQuestion("tâches bloquées de Fabienne ?", AUJ)).toMatchObject({ sujet: "bloquees", motsPersonne: "Fabienne" });
    expect(analyserQuestion("projets à surveiller ?", AUJ)).toMatchObject({ sujet: "projets" });
    expect(analyserQuestion("mes réunions aujourd'hui ?", AUJ)).toMatchObject({ sujet: "reunions", periode: { debut: AUJ, fin: AUJ } });
    expect(analyserQuestion("quel temps fait-il ?", AUJ).sujet).toBeNull();
  });
});

describe("des mots à la place des touches", () => {
  it("une personne : prénom, nom ou les deux, seulement si elle est la seule", () => {
    expect(personneNommee("Fabienne", G)?.id).toBe("fm");
    expect(personneNommee("fabienne michel", G)?.id).toBe("fm");
    expect(personneNommee("Joseph", G)).toBeNull(); // Daphnée et Marie Joseph
    expect(personneNommee("daphnee", G)?.id).toBe("dj"); // sans accent
    expect(personneNommee("moi", G, "mv")?.id).toBe("mv");
  });
  it("un projet : code ou mots du titre, seulement s'il est le seul", () => {
    expect(projetNomme("credos", P)?.id).toBe("p-cr");
    expect(projetNomme("retail", P)?.id).toBe("p-ur");
    expect(projetNomme("unibankonline", P)).toBeNull(); // Retail et Corporate
    expect(projetNomme("ur", P)?.id).toBe("p-ur");
  });
  it("tâche : « pour Fabienne », « projet Credos » ; « pour vendredi » reste une date", () => {
    const r = reconnaitreMots("Relire maquettes pour Fabienne projet Credos vendredi", { personnes: G, projets: P });
    expect(r).toMatchObject({ texte: "Relire maquettes vendredi", personne: { id: "fm" }, projet: { id: "p-cr" } });
    expect(reconnaitreMots("Envoyer le contrat pour vendredi", { personnes: G, projets: P })).toMatchObject({ texte: "Envoyer le contrat pour vendredi", personne: null });
    expect(reconnaitreMots("Point sur le projet Unibankonline Retail", { personnes: G, projets: P })).toMatchObject({ texte: "Point", projet: { id: "p-ur" } });
    expect(reconnaitreMots("Préparer la démo pour moi", { personnes: G, projets: P, moiId: "mv" }).personne?.id).toBe("mv");
  });
  it("réunion : « avec Fabienne, Daphnée et Myriam »", () => {
    const r = reconnaitreMots("Réunion revue avec Fabienne, Daphnée et Myriam jeudi 10h", { personnes: G, projets: P, reunion: true });
    expect(r.invites.map((p) => p.id)).toEqual(["fm", "dj", "mv"]);
    expect(r.texte).toBe("Réunion revue jeudi 10h");
    // Un nom qu'on ne reconnaît pas : rien n'est retiré (on ne devine pas).
    expect(reconnaitreMots("Réunion avec Fabienne et Pierre", { personnes: G, projets: P, reunion: true }).invites).toEqual([]);
  });
});

describe("de quoi parle la ligne", () => {
  const o = { projetChoisi: false, projets: P, aujourdhui: AUJ };
  it("question, réunion, note, projet, tâche", () => {
    expect(genreDe("en retard sur UR ?", o)).toBe("question");
    expect(genreDe("Réunion point hebdo", o)).toBe("reunion");
    expect(genreDe("Décision : budget", o)).toBe("note");
    expect(genreDe("UR à surveiller : retard", o)).toBe("projet");
    expect(genreDe("à surveiller : retard", { ...o, projetChoisi: true })).toBe("projet");
    expect(genreDe("Relire maquettes", o)).toBe("tache");
  });
});

describe("relancer", () => {
  it("« relancer » et un message facultatif", () => {
    expect(analyserMiseAJour("relancer", AUJ)).toMatchObject({ relance: "", statut: null });
    expect(analyserMiseAJour("Relancer : il nous faut la maquette demain", AUJ)).toMatchObject({ relance: "il nous faut la maquette demain", echeance: null });
    expect(analyserMiseAJour("relance faite hier", AUJ).relance).toBe("faite hier");
    expect(analyserMiseAJour("faite", AUJ).relance).toBeNull();
  });
});

describe("une ligne de formulaire écrite comme dans la barre", () => {
  it("ligne du rapport : le projet par son code, par « projet … », sinon aucun ; les dates restent du texte", () => {
    expect(analyserLigne("Recette validée UR", { projets: P })).toMatchObject({ texte: "Recette validée", projet: P[0] });
    expect(analyserLigne("UR : recette validée", { projets: P })).toMatchObject({ texte: "recette validée", projet: P[0] });
    expect(analyserLigne("Comité tenu sur le projet Credos", { projets: P })).toMatchObject({ texte: "Comité tenu", projet: P[2] });
    expect(analyserLigne("Recette prévue le 15/11 avec la DTI", { projets: P })).toMatchObject({ texte: "Recette prévue le 15/11 avec la DTI", projet: null, echeance: null });
    // « ur » en minuscules n'est pas un code : un mot ordinaire ne devient pas un projet.
    expect(analyserLigne("Point sur la recette ur", { projets: P }).projet).toBeNull();
  });
  it("action de réunion : la personne, la date et le reste comme titre", () => {
    expect(analyserLigne("Envoyer le compte rendu pour Fabienne vendredi", { personnes: G, aujourdhui: AUJ })).toMatchObject({
      texte: "Envoyer le compte rendu",
      personne: G[0],
      echeance: "2026-10-30",
    });
    expect(analyserLigne("Préparer la démo pour vendredi", { personnes: G, aujourdhui: AUJ })).toMatchObject({ texte: "Préparer la démo", personne: null, echeance: "2026-10-30" });
  });
  it("titre d'une tâche : projet, personne, échéance et temps estimé", () => {
    expect(analyserLigne("Relire les maquettes UR pour Myriam 12/11 3h", { projets: P, personnes: G, aujourdhui: AUJ, heures: true })).toEqual({
      texte: "Relire les maquettes",
      projet: P[0],
      personne: G[2],
      echeance: "2026-11-12",
      heures: 3,
    });
  });
});
