/**
 * Gestion des projets et des tâches, contre la base de démonstration (voir tests/preparer-base.ts).
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as ProjetsModule from "@/lib/donnees/projets";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("gestion des projets et des tâches", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let PR: typeof ProjetsModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const tache = async (id: string) => (await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, id)))[0];
  const projet = async (id: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, id)))[0];
  const notifications = async (courriel: string, type: string) =>
    D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, qui(courriel).id), eq(D.schema.notifications.type, type)));
  const demande = (titre: string, chefSuggereId = "") => ({ titre, description: "", justification: "Utile à la banque.", programme: "", strategique: false, finSouhaitee: "2027-03-31", chefSuggereId, code: "" });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    PR = await import("@/lib/donnees/projets");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("la demande de Joël est vue par sa direction et par lui, pas par une autre direction", async () => {
    const td = projets.get("TD")!;
    const voit = async (c: string) => {
      const a = await acces(c);
      return (await G.demandesDeProjet(a, await A.idsProjetsVisibles(a))).some((d) => d.id === td);
    };
    expect(await voit("joel.dorval")).toBe(true);
    expect(await voit("nadege.augustin")).toBe(true);
    expect(await voit("frantz.desrosiers")).toBe(true);
    expect(await voit("marc-antoine.louis")).toBe(false);
    expect(await voit("daphnee.joseph")).toBe(false);
    // Une demande n'est pas dans le portefeuille.
    expect((await PR.portefeuille(await acces("nadege.augustin"))).some((p) => p.id === td)).toBe(false);
    // Le refus reste visible à son auteure, avec le motif.
    const sc = await acces("sophonie.charles");
    const gl = (await G.demandesDeProjet(sc, await A.idsProjetsVisibles(sc))).find((d) => d.code === "GL");
    expect(gl?.statut).toBe("refuse");
    expect(gl?.motif).toMatch(/Uninet/);
  });

  it("proposer : titre et justification requis ; les directeurs au-dessus et les exécutifs sont prévenus", async () => {
    expect(await G.proposerProjet({ ...demande(""), titre: "" }, qui("ludovic.pierre").id)).toHaveProperty("erreur");
    expect(await G.proposerProjet({ ...demande("Sans raison"), justification: " " }, qui("ludovic.pierre").id)).toHaveProperty("erreur");
    expect(await G.proposerProjet({ ...demande("Code pris"), code: "UR" }, qui("ludovic.pierre").id)).toEqual({ erreur: "Le code UR est déjà pris." });
    const r = await G.proposerProjet(demande("Signature électronique des contrats"), qui("ludovic.pierre").id);
    expect(r).toHaveProperty("id");
    const p = await projet((r as { id: string }).id);
    expect(p.statut).toBe("requete");
    expect(p.code).toBe("SEC");
    for (const c of ["marc-antoine.louis", "nadege.augustin", "frantz.desrosiers"]) expect((await notifications(c, "demande_projet")).some((n) => n.texte.includes("Signature électronique"))).toBe(true);
    expect((await notifications("myriam.valcin", "demande_projet")).some((n) => n.texte.includes("Signature électronique"))).toBe(false);
  });

  it("décider : un refus a un motif ; une acceptation nomme le chef, qui retrouve le projet dans son portefeuille", async () => {
    const r = (await G.proposerProjet(demande("Coffre-fort numérique"), qui("wesner.bazile").id)) as { id: string };
    expect(await G.deciderDemande(r.id, { accepte: false, motif: "" }, qui("marc-antoine.louis").id)).toHaveProperty("erreur");
    expect(await G.deciderDemande(r.id, { accepte: true, motif: "", chefProjetId: "" }, qui("marc-antoine.louis").id)).toEqual({ erreur: "Nommez le chef de projet." });
    expect(await G.deciderDemande(r.id, { accepte: true, motif: "Allez-y", chefProjetId: qui("wesner.bazile").id, statut: "en_cours", dateEntree: "2026-11-02" }, qui("marc-antoine.louis").id)).toEqual({ ok: true });
    const p = await projet(r.id);
    expect(p.statut).toBe("en_cours");
    expect(p.dateEntree).toBe("2026-11-02");
    expect(p.dateFinInitiale).toBe("2027-03-31");
    expect((await notifications("wesner.bazile", "demande_projet")).some((n) => n.texte.includes("acceptée"))).toBe(true);
    expect((await PR.portefeuille(await acces("wesner.bazile"))).some((x) => x.id === r.id)).toBe(true);
    // Une demande déjà traitée ne se redécide pas.
    expect(await G.deciderDemande(r.id, { accepte: false, motif: "Finalement non" }, qui("nadege.augustin").id)).toHaveProperty("erreur");
  });

  it("les membres de l'équipe projet voient le projet", async () => {
    // Joël Dorval a rejoint l'équipe d'UR sans y avoir de tâche.
    const visibles = await A.idsProjetsVisibles(await acces("joel.dorval"));
    expect(visibles !== "tous" && visibles.has(projets.get("UR")!)).toBe(true);
    expect(visibles !== "tous" && visibles.has(projets.get("UC")!)).toBe(false);
    expect((await G.membresDuProjet(projets.get("UR")!)).map((m) => m.nom)).toContain("Joël Dorval");
  });

  it("rôles d'équipe : les rôles existants sont proposés, et un rôle saisi autrement reprend l'existant", async () => {
    const roles = await G.rolesDesEquipes();
    expect(roles[0]).toBe("Développeur"); // le plus donné d'abord
    expect(roles).toContain("Analyste fonctionnel");
    expect(await G.roleNormalise("  analyste   FONCTIONNEL ")).toBe("Analyste fonctionnel");
    expect(await G.roleNormalise("developpeur")).toBe("Développeur");
    expect(await G.roleNormalise("expert en paiements")).toBe("Expert en paiements");
    expect(await G.roleNormalise("   ")).toBe("");
    const mv = qui("myriam.valcin").id;
    await G.ajouterMembre(projets.get("UR")!, qui("fabienne.michel").id, "analyste fonctionnel", mv);
    const fm = (await G.membresDuProjet(projets.get("UR")!)).find((m) => m.personneId === qui("fabienne.michel").id);
    expect(fm?.role).toBe("Analyste fonctionnel");
    await G.changerRoleMembre(projets.get("UR")!, fm!.id, "pilote de la migration");
    expect(await G.rolesDesEquipes()).toContain("Pilote de la migration");
  });

  it("assigner : la cheffe de projet confie des tâches à son équipe projet, sur son projet seulement", async () => {
    const mv = await acces("myriam.valcin");
    const base = { description: "", echeance: null, debut: null, estimationHeures: null };
    // Ricardo est membre d'UR, mais Myriam ne le suit pas.
    const ok = await G.creerTacheGeree(mv, { ...base, titre: "Revue des correctifs", projetId: projets.get("UR")!, assigneId: qui("ricardo.etienne").id });
    expect(ok).toHaveProperty("id");
    expect(await G.creerTacheGeree(mv, { ...base, titre: "Hors projet", projetId: null, assigneId: qui("ricardo.etienne").id })).toHaveProperty("erreur");
    expect(await G.creerTacheGeree(mv, { ...base, titre: "Autre projet", projetId: projets.get("CR")!, assigneId: qui("ricardo.etienne").id })).toHaveProperty("erreur");
    // Pas de tâche sur une demande ni sur un projet archivé.
    expect(await G.creerTacheGeree(mv, { ...base, titre: "Trop tôt", projetId: projets.get("TD")!, assigneId: qui("myriam.valcin").id })).toHaveProperty("erreur");
    expect(await G.creerTacheGeree(await acces("marc-antoine.louis"), { ...base, titre: "Trop tard", projetId: projets.get("MS")!, assigneId: qui("marc-antoine.louis").id })).toHaveProperty("erreur");
    // Confier une tâche fait entrer dans l'équipe projet.
    const ml = await acces("marc-antoine.louis");
    const r = await G.creerTacheGeree(ml, { ...base, titre: "Spécifications du tableau de bord", projetId: projets.get("UC")!, assigneId: qui("sophonie.charles").id });
    expect(r).toHaveProperty("id");
    expect((await G.membresDuProjet(projets.get("UC")!)).some((m) => m.personneId === qui("sophonie.charles").id)).toBe(true);
    expect((await G.assignables(mv)).parProjet[projets.get("UR")!]).toContain(qui("ricardo.etienne").id);
  });

  it("réassigner : les deux personnes sont prévenues et l'événement est noté", async () => {
    const ml = await acces("marc-antoine.louis");
    const r = (await G.creerTacheGeree(ml, { titre: "Plan de tests", description: "", projetId: projets.get("UC")!, assigneId: qui("jean-robert.noel").id, echeance: null, debut: null, estimationHeures: null })) as { id: string };
    const t = await tache(r.id);
    expect(await G.modifierDefinitionTache(ml, t, { titre: "Plan de tests v2", description: "Avec la paie", projetId: t.projetId, assigneId: qui("sophonie.charles").id })).toEqual({ ok: true });
    const apres = await tache(r.id);
    expect(apres.assigneId).toBe(qui("sophonie.charles").id);
    expect(apres.description).toBe("Avec la paie");
    const ev = await D.db.select().from(D.schema.evenementsTache).where(eq(D.schema.evenementsTache.tacheId, r.id));
    expect(ev.map((e) => e.type).sort()).toEqual(["assignation", "creation", "titre"]);
    expect((await notifications("jean-robert.noel", "tache")).some((n) => n.texte.includes("maintenant confiée à Sophonie Charles"))).toBe(true);
    // Un employé ne réassigne pas à quelqu'un qu'il ne suit pas.
    expect(await G.modifierDefinitionTache(await acces("sophonie.charles"), apres, { titre: apres.titre, description: "", projetId: apres.projetId, assigneId: qui("ricardo.etienne").id })).toHaveProperty("erreur");
  });

  it("une tâche sans histoire se supprime ; une tâche commencée s'annule, puis se rétablit", async () => {
    const dj = await acces("daphnee.joseph");
    const neuve = (await G.creerTacheGeree(dj, { titre: "Créée par erreur", description: "", projetId: null, assigneId: dj.moi.id, echeance: null, debut: null, estimationHeures: null })) as { id: string };
    expect(await G.supprimerTache(dj, await tache(neuve.id))).toEqual({ ok: true });
    expect(await tache(neuve.id)).toBeUndefined();

    const [commencee] = await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.assigneId, dj.moi.id), eq(D.schema.taches.titre, "Maquettes de l'accueil")));
    expect(await G.supprimerTache(dj, commencee)).toHaveProperty("erreur");
    expect(await G.annulerTache(dj, commencee, " ")).toHaveProperty("erreur");
    expect(await G.annulerTache(dj, commencee, "Remplacée par la charte graphique")).toEqual({ ok: true });
    expect((await tache(commencee.id)).annuleeLe).not.toBeNull();
    expect((await PR.tachesDuProjet(projets.get("UN")!)).some((t) => t.id === commencee.id)).toBe(false);
    await G.retablirTache(dj, await tache(commencee.id));
    expect((await tache(commencee.id)).annuleeLe).toBeNull();
    expect((await PR.tachesDuProjet(projets.get("UN")!)).some((t) => t.id === commencee.id)).toBe(true);
  });

  it("un projet qui a une histoire s'archive ; un projet vide se supprime", async () => {
    const ex = qui("frantz.desrosiers").id;
    expect(await G.supprimerProjet(projets.get("UR")!, ex)).toHaveProperty("erreur");
    const r = (await G.proposerProjet(demande("Projet de test à supprimer"), qui("ludovic.pierre").id)) as { id: string };
    expect(await G.supprimerProjet(r.id, ex)).toEqual({ ok: true });
    expect(await projet(r.id)).toBeUndefined();

    const fx = await acces("frantz.desrosiers");
    await G.archiverProjet(projets.get("AE")!, true, ex);
    expect((await PR.portefeuille(fx)).some((p) => p.code === "AE")).toBe(false);
    expect((await PR.portefeuille(fx, { archives: true })).map((p) => p.code)).toEqual(expect.arrayContaining(["AE", "MS"]));
    expect((await PR.tousLesProjetsActifs()).some((p) => p.code === "AE")).toBe(false);
    await G.archiverProjet(projets.get("AE")!, false, ex);
    expect((await PR.portefeuille(fx)).some((p) => p.code === "AE")).toBe(true);
  });

  it("modifier : code unique, chef obligatoire pour un projet accepté ; indicateurs réordonnés", async () => {
    const ex = qui("frantz.desrosiers").id;
    const p = await projet(projets.get("CR")!);
    const base = { code: p.code, titre: p.titre, description: p.description, programme: p.programme, strategique: p.strategique, statut: p.statut, chefProjetId: p.chefProjetId ?? "", referentId: p.referentId ?? "", division: p.division, dateEntree: p.dateEntree ?? "", dateFinInitiale: p.dateFinInitiale ?? "", dateFinPrevue: p.dateFinPrevue ?? "", dateLancementPrevue: "" };
    expect(await G.modifierProjet(p.id, { ...base, code: "UN" }, ex)).toEqual({ erreur: "Le code UN est déjà pris." });
    expect(await G.modifierProjet(p.id, { ...base, chefProjetId: "" }, ex)).toHaveProperty("erreur");
    expect(await G.modifierProjet(p.id, { ...base, titre: "Refonte de Credos", statut: "requete" }, ex)).toEqual({ ok: true });
    const apres = await projet(p.id);
    expect(apres.titre).toBe("Refonte de Credos");
    expect(apres.statut).toBe("en_cours"); // la demande passe par la décision, pas par ce formulaire

    const ind = async () => (await D.db.select().from(D.schema.indicateurs).where(eq(D.schema.indicateurs.projetId, p.id))).sort((x, y) => x.ordre - y.ordre).map((i) => i.libelle);
    const avant = await ind();
    const [second] = await D.db.select().from(D.schema.indicateurs).where(and(eq(D.schema.indicateurs.projetId, p.id), eq(D.schema.indicateurs.ordre, 2)));
    await G.deplacerIndicateur(p.id, second.id, -1);
    expect((await ind()).slice(0, 2)).toEqual([avant[1], avant[0]]);
    await G.retirerIndicateur(p.id, second.id, ex);
    const reste = await D.db.select().from(D.schema.indicateurs).where(eq(D.schema.indicateurs.projetId, p.id));
    expect(reste.map((i) => i.ordre).sort()).toEqual(reste.map((_, i) => i + 1));
  });
});
