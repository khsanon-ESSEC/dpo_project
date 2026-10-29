import { describe, expect, it } from "vitest";
import { analyserCommande, chercherCatalogue, elementNomme, estQuestionCharge, type ContexteCommande } from "@/lib/commandes";

const AUJ = "2026-10-29"; // jeudi
const P = [
  { id: "p-ur", code: "UR", titre: "Nouvelle version UNIBANKOnline Retail" },
  { id: "p-uc", code: "UC", titre: "Nouvelle version UNIBANKOnline Corporate" },
  { id: "p-cr", code: "CR", titre: "Refonte Credos" },
];
const G = [
  { id: "fm", nom: "Fabienne Michel" },
  { id: "dj", nom: "Daphnée Joseph" },
  { id: "mv", nom: "Myriam Valcin" },
  { id: "re", nom: "Ricardo Étienne" },
  { id: "fd", nom: "Frantz Desrosiers" },
  { id: "mj", nom: "Marie Joseph" },
];
const CTX: ContexteCommande = {
  projets: P,
  personnes: G,
  moiId: "mv",
  aujourdhui: AUJ,
  livrables: [
    { id: "l-audit", projetId: "p-ur", libelle: "Audit de sécurité effectué et passé", etat: "en_cours" },
    { id: "l-app", projetId: "p-ur", libelle: "Application développée", etat: "atteint" },
    { id: "l-mel", projetId: "p-ur", libelle: "Application mise en ligne", etat: "a_venir" },
    { id: "l-plan", projetId: "p-ur", libelle: "Plan de lancement finalisé et approuvé", etat: "a_venir" },
    { id: "l-dev", projetId: "p-uc", libelle: "Développement terminé", etat: "en_cours" },
    { id: "l-cr", projetId: "p-cr", libelle: "Validation métier réalisée", etat: "en_cours" },
  ],
  phases: [
    { id: "ph-1", projetId: "p-ur", libelle: "Réalisation", etat: "terminee" },
    { id: "ph-2", projetId: "p-ur", libelle: "Validation métier", etat: "ouverte" },
    { id: "ph-3", projetId: "p-ur", libelle: "Déploiement", etat: "ouverte" },
  ],
  risques: [
    { id: "r-1", projetId: "p-ur", libelle: "Les correctifs de l'audit ne sont pas prêts", etat: "ouvert" },
    { id: "r-2", projetId: "p-ur", libelle: "Le prestataire n'est pas disponible pendant les fêtes", etat: "maitrise" },
  ],
};
const cmd = (s: string, choisi: (typeof P)[number] | null = null) => analyserCommande(s, CTX, choisi);

describe("créer un projet", () => {
  it("titre, pourquoi, chef, fin, code, stratégique", () => {
    expect(cmd("Nouveau projet : Refonte du site : l'actuel ne s'affiche pas sur téléphone")?.commande).toEqual({
      type: "nouveau_projet",
      titre: "Refonte du site",
      justification: "L'actuel ne s'affiche pas sur téléphone",
      chefId: null,
      fin: null,
      code: null,
      strategique: false,
    });
    expect(cmd("créer un projet : Portail fournisseurs stratégique code PF chef Daphnée fin 30/06/2027 : les achats veulent suivre les factures")?.commande).toEqual({
      type: "nouveau_projet",
      titre: "Portail fournisseurs",
      justification: "Les achats veulent suivre les factures",
      chefId: "dj",
      fin: "2027-06-30",
      code: "PF",
      strategique: true,
    });
  });
  it("sans pourquoi : ce qui manque est dit", () => {
    const r = cmd("Nouveau projet : Refonte du site");
    expect(r?.commande).toBeNull();
    expect(r?.manque).toMatch(/Dites pourquoi/);
    // Sans deux-points, c'est une tâche.
    expect(cmd("Nouveau projet de formation à préparer")).toBeNull();
  });
});

describe("livrables", () => {
  it("ajouter un livrable : nom, date, responsable", () => {
    expect(cmd("UR nouveau livrable maquettes validées 15/12 pour Daphnée")?.commande).toEqual({ type: "livrable_creer", libelle: "Maquettes validées", prevuLe: "2026-12-15", responsableId: "dj" });
    // Comme avant : « livrable … » sur un nom inconnu crée le livrable, l'état éventuel restant dans le nom.
    expect(cmd("UR livrable modèle conceptuel validé 20/11")?.commande).toEqual({ type: "livrable_creer", libelle: "Modèle conceptuel validé", prevuLe: "2026-11-20", responsableId: null });
    expect(cmd("livrable maquettes", P[0])?.commande).toMatchObject({ type: "livrable_creer", libelle: "Maquettes" });
  });
  it("assigner un livrable, changer sa date", () => {
    expect(cmd("UR assigner le livrable audit à Daphnée Joseph")).toMatchObject({ commande: { type: "livrable_modifier", livrableId: "l-audit", responsableId: "dj", prevuLe: null }, projet: { id: "p-ur" } });
    expect(cmd("UR livrable plan de lancement pour Ricardo")?.commande).toEqual({ type: "livrable_modifier", livrableId: "l-plan", prevuLe: null, responsableId: "re" });
    expect(cmd("UR livrable audit 20/11")?.commande).toEqual({ type: "livrable_modifier", livrableId: "l-audit", prevuLe: "2026-11-20", responsableId: null });
    // Sans projet : le livrable n'existe que dans UC.
    expect(cmd("confier le livrable développement terminé à Fabienne")).toMatchObject({ commande: { type: "livrable_modifier", livrableId: "l-dev", responsableId: "fm" }, projet: { id: "p-uc" } });
    // Sans projet ni livrable connu : une tâche comme une autre.
    expect(cmd("Confier le livrable papier à la DRH")).toBeNull();
  });
  it("prêt, valider, renvoyer, rouvrir", () => {
    expect(cmd("UR livrable audit prêt")?.commande).toEqual({ type: "livrable_etat", livrableId: "l-audit", action: "pret", remarque: "" });
    expect(cmd("UR valider le livrable audit")?.commande).toMatchObject({ action: "valider", livrableId: "l-audit" });
    expect(cmd("UR renvoyer le livrable audit : compléter le point 6")?.commande).toEqual({ type: "livrable_etat", livrableId: "l-audit", action: "renvoyer", remarque: "Compléter le point 6" });
    expect(cmd("UR renvoyer le livrable audit")?.manque).toMatch(/reste à reprendre/);
    expect(cmd("UR livrable application développée rouvert")?.commande).toMatchObject({ action: "rouvrir", livrableId: "l-app" });
  });
  it("plusieurs livrables correspondent : on demande de préciser ; un livrable nommé seul s'ouvre", () => {
    expect(cmd("UR livrable application prêt")?.manque).toMatch(/Plusieurs livrables/);
    expect(cmd("UR livrable audit")?.commande).toEqual({ type: "aller", lien: "/projets/p-ur#livrable-l-audit" });
  });
  it("un mot ne trouve un livrable que s'il commence un mot de son nom", () => {
    expect(elementNomme("audit", CTX.livrables)).toMatchObject({ element: { id: "l-audit" } });
    expect(elementNomme("udit", CTX.livrables)).toBeNull();
  });
});

describe("équipe, décisions, risques, phases", () => {
  it("équipe", () => {
    expect(cmd("UR ajouter Fabienne à l'équipe comme analyste")?.commande).toEqual({ type: "membre_ajouter", personneId: "fm", role: "Analyste" });
    expect(cmd("UR équipe + Marie Joseph")?.commande).toEqual({ type: "membre_ajouter", personneId: "mj", role: "" });
    expect(cmd("UR ajouter Joseph à l'équipe")?.manque).toMatch(/précisez le nom/);
    expect(cmd("UR retirer Ricardo de l'équipe")?.commande).toEqual({ type: "membre_retirer", personneId: "re" });
  });
  it("décision prise, avec son instance ; « Décision : … » reste une note pour le rapport", () => {
    expect(cmd("UR décision prise : mise en ligne en deux vagues (par le comité de pilotage)")?.commande).toEqual({ type: "decision", texte: "Mise en ligne en deux vagues", instance: "Comité de pilotage" });
    expect(cmd("UR décidé : contre-audit externe par copil")?.commande).toEqual({ type: "decision", texte: "Contre-audit externe", instance: "Comité de pilotage" });
    expect(cmd("Décision : valider le budget UR")).toBeNull();
  });
  it("risques : au registre, et leur statut ; « risque : … » reste le signal de santé", () => {
    expect(cmd("UR nouveau risque : retard du prestataire, probable, impact fort, suivi par Ricardo")?.commande).toEqual({ type: "risque_creer", titre: "Retard du prestataire", probabilite: 3, impact: 3, responsableId: "re" });
    expect(cmd("UR ajouter un risque : départ d'un développeur")?.commande).toMatchObject({ probabilite: 2, impact: 2, responsableId: null });
    expect(cmd("UR risque correctifs maîtrisé")?.commande).toEqual({ type: "risque_statut", risqueId: "r-1", statut: "maitrise" });
    expect(cmd("UR clore le risque prestataire")?.commande).toEqual({ type: "risque_statut", risqueId: "r-2", statut: "clos" });
    expect(cmd("UR risque : le prestataire ne livre pas")).toBeNull();
  });
  it("phases", () => {
    expect(cmd("UR terminer la phase")?.commande).toEqual({ type: "phase_terminer", phaseId: null });
    expect(cmd("UR terminer la phase")?.resume).toMatch(/Validation métier/);
    expect(cmd("UR phase déploiement terminée")?.commande).toEqual({ type: "phase_terminer", phaseId: "ph-3" });
    expect(cmd("CR phases types")?.commande).toEqual({ type: "phases_types" });
    expect(cmd("UR nouvelle phase pilote en agence du 2/11 au 30/11")?.commande).toEqual({ type: "phase_ajouter", nom: "Pilote en agence", debut: "2026-11-02", fin: "2026-11-30" });
  });
});

describe("le projet lui-même", () => {
  it("sponsor, chef, priorité", () => {
    expect(cmd("UR sponsor Frantz Desrosiers")?.commande).toEqual({ type: "sponsor", personneId: "fd" });
    expect(cmd("UR sans sponsor")?.commande).toEqual({ type: "sponsor", personneId: null });
    expect(cmd("UR sponsor à trouver auprès de la direction des opérations")).toBeNull();
    expect(cmd("UR chef de projet Daphnée")?.commande).toEqual({ type: "chef", personneId: "dj" });
    expect(cmd("UR priorité haute")?.commande).toEqual({ type: "priorite", priorite: "haute" });
    expect(cmd("priorité basse", P[2])?.commande).toEqual({ type: "priorite", priorite: "basse" });
  });
  it("budget : prévu, engagé, devise ; sans montant, c'est une tâche", () => {
    expect(cmd("UR budget 12,5 M engagé 11,8 M")?.commande).toEqual({ type: "budget", prevu: 12_500_000, engage: 11_800_000, devise: null });
    expect(cmd("UR budget engagé 3 000 000")?.commande).toEqual({ type: "budget", prevu: null, engage: 3_000_000, devise: null });
    expect(cmd("UR engagé 800 k usd")?.commande).toEqual({ type: "budget", prevu: null, engage: 800_000, devise: "USD" });
    expect(cmd("UR budget DTI à valider")).toBeNull();
  });
  it("clôturer : avec un bilan et les objectifs, sinon le formulaire ; rouvrir", () => {
    expect(cmd("UR clôturer : en ligne pour tous les clients, objectifs atteints")?.commande).toEqual({ type: "cloturer", bilan: "En ligne pour tous les clients", objectifs: "oui" });
    expect(cmd("UR clôturer")?.commande).toEqual({ type: "aller", lien: "/projets/p-ur?cloture=ouvrir#cloture" });
    expect(cmd("UR clôturer le marché du prestataire")).toBeNull();
    expect(cmd("UR rouvrir")?.commande).toEqual({ type: "rouvrir" });
  });
  it("le projet par « projet … » en toutes lettres", () => {
    expect(cmd("projet credos priorité haute")).toMatchObject({ commande: { type: "priorite" }, projet: { id: "p-cr" } });
  });
});

describe("rapports et questions", () => {
  it("générer un rapport : les choix ; envoyer, conseil, Word, ponctuel", () => {
    expect(cmd("générer un rapport")?.choix?.length).toBeGreaterThan(4);
    expect(cmd("envoyer mon rapport")?.commande).toEqual({ type: "envoyer_rapport" });
    expect(cmd("mon rapport de la semaine")?.commande).toEqual({ type: "aller", lien: "/rapport" });
    expect(cmd("rapport au conseil")?.commande).toEqual({ type: "aller", lien: "/conseil" });
    expect(cmd("générer le rapport au conseil en Word")?.commande).toEqual({ type: "aller", lien: "/api/conseil/2026-10-01/word" });
    expect(cmd("rapport ponctuel : point sur UNIBANKOnline : pour le conseil du 15")?.commande).toEqual({ type: "rapport_ponctuel", titre: "Point sur UNIBANKOnline", objet: "Pour le conseil du 15" });
    expect(cmd("Rapport de Fabienne")).toBeNull();
  });
  it("« charge de Myriam » est une question, si la personne existe", () => {
    expect(estQuestionCharge("charge de Myriam", G)).toBe(true);
    expect(estQuestionCharge("Charge de Daphnée Joseph la semaine prochaine", G)).toBe(true);
    expect(estQuestionCharge("Charge du serveur à tester", G)).toBe(false);
  });
  it("une tâche ordinaire n'est pas une action", () => {
    expect(cmd("Relire les maquettes UR vendredi")).toBeNull();
    expect(cmd("UR relire le plan de lancement")).toBeNull();
    expect(cmd("Ajouter les comptes de test")).toBeNull();
  });
  it("la liste « > » : filtrée par les mots et par les droits", () => {
    const tout = () => true;
    expect(chercherCatalogue("livrable", tout).map((e) => e.cle)).toEqual(expect.arrayContaining(["livrable-nouveau", "livrable-assigner", "livrable-valider"]));
    expect(chercherCatalogue("", (p) => p === "tous").every((e) => e.permis === "tous")).toBe(true);
    expect(chercherCatalogue("charge", tout).map((e) => e.cle)).toContain("charge");
  });
});

describe("une tâche, depuis la barre", async () => {
  const { analyserMiseAJour, analyserSaisie } = await import("@/lib/saisie-rapide");
  it("créer : la priorité dans la phrase", () => {
    expect(analyserSaisie("Relire maquettes UR vendredi priorité haute", AUJ, P)).toMatchObject({ titre: "Relire maquettes", priorite: "haute", projet: { id: "p-ur" } });
    expect(analyserSaisie("Relire maquettes", AUJ, P).priorite).toBeNull();
  });
  it("mettre à jour : priorité, temps passé, répétition, avec le reste", () => {
    expect(analyserMiseAJour("faite, passé 1h30", AUJ)).toMatchObject({ statut: "faite", minutesPassees: 90, note: "" });
    expect(analyserMiseAJour("priorité haute", AUJ)).toMatchObject({ priorite: "haute", statut: null, note: "" });
    expect(analyserMiseAJour("j'ai passé 45 min", AUJ)).toMatchObject({ minutesPassees: 45, note: "" });
    expect(analyserMiseAJour("répéter chaque lundi", AUJ)).toMatchObject({ rythme: "semaine:1", note: "" });
    expect(analyserMiseAJour("répéter chaque mois le dernier jour", AUJ)).toMatchObject({ rythme: "mois:31" });
    expect(analyserMiseAJour("répéter tous les mois le 15", AUJ)).toMatchObject({ rythme: "mois:15" });
    expect(analyserMiseAJour("bloquée attente de la DTI, priorité haute", AUJ)).toMatchObject({ statut: "bloquee", blocage: "Attente de la DTI", priorite: "haute" });
    expect(analyserMiseAJour("en cours 3h", AUJ)).toMatchObject({ statut: "en_cours", heures: 3, minutesPassees: null });
  });
  it("annuler (avec un motif) ; arrêter la répétition", () => {
    expect(analyserMiseAJour("annuler : plus nécessaire après la décision du comité", AUJ)).toMatchObject({ annulation: "plus nécessaire après la décision du comité", statut: null });
    expect(analyserMiseAJour("annuler", AUJ).annulation).toBe("");
    expect(analyserMiseAJour("arrêter la répétition", AUJ).arreterRepetition).toBe(true);
  });
});
