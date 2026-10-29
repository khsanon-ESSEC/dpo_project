/**
 * Les actions de la barre, contre la base de démonstration : chaque action passe par la règle de l'écran
 * correspondant (qui peut le faire), et « Annuler » la défait.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as CommandesModule from "@/lib/donnees/commandes";
import type * as AnnulationsModule from "@/lib/donnees/annulations";
import type * as QuestionsModule from "@/lib/donnees/questions";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("actions de la barre", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let C: typeof CommandesModule;
  let N: typeof AnnulationsModule;
  let Q: typeof QuestionsModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const faire = async (courriel: string, saisie: string, projetId = "") => C.executerCommande(qui(courriel), await A.acces(qui(courriel)), { saisie, projetId });
  const annuler = async (courriel: string, id: string | undefined) => N.annulerAction(await A.acces(qui(courriel)), id ?? "");
  const projet = async (code: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get(code)!)))[0];
  const livrable = async (code: string, libelle: string) => (await D.db.select().from(D.schema.indicateurs).where(and(eq(D.schema.indicateurs.projetId, projets.get(code)!), eq(D.schema.indicateurs.libelle, libelle))))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    C = await import("@/lib/donnees/commandes");
    N = await import("@/lib/donnees/annulations");
    Q = await import("@/lib/donnees/questions");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("livrable : l'ajouter avec son responsable, l'assigner, « Annuler » ; un membre ne le fait pas", async () => {
    const r = await faire("myriam.valcin", "UR nouveau livrable maquettes du parcours mobile 15/12 pour Daphnée");
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/^UR · Livrable « Maquettes du parcours mobile » ajouté, prévu le 15 déc\..*responsable Daphnée Joseph \(prévenu\)/) });
    const l = await livrable("UR", "Maquettes du parcours mobile");
    expect(l).toMatchObject({ prevuLe: "2026-12-15", responsableId: qui("daphnee.joseph").id });
    expect(await annuler("myriam.valcin", r.annulation)).toMatchObject({ ok: true });
    expect(await livrable("UR", "Maquettes du parcours mobile")).toBeUndefined();

    const audit = await livrable("UR", "Audit de sécurité effectué et passé");
    const a = await faire("myriam.valcin", "UR assigner le livrable audit à Ricardo");
    expect(a).toMatchObject({ ok: true });
    expect((await livrable("UR", "Audit de sécurité effectué et passé")).responsableId).toBe(qui("ricardo.etienne").id);
    expect(await annuler("myriam.valcin", a.annulation)).toMatchObject({ ok: true });
    expect((await livrable("UR", "Audit de sécurité effectué et passé")).responsableId).toBe(audit.responsableId);

    expect(await faire("ricardo.etienne", "UR assigner le livrable audit à Ricardo")).toMatchObject({ message: expect.stringMatching(/Seuls le chef de projet/) });
    expect((await faire("ricardo.etienne", "UR nouveau livrable test")).ok).toBeFalsy();
  });

  it("livrable : son responsable le déclare prêt ; la cheffe de projet le renvoie avec une remarque", async () => {
    const r = await faire("daphnee.joseph", "UR livrable audit prêt");
    expect(r).toMatchObject({ ok: true, message: "UR · « Audit de sécurité effectué et passé » : livrable déclaré prêt à valider." });
    expect(await faire("myriam.valcin", "UR renvoyer le livrable audit : compléter le point 6")).toMatchObject({ ok: true });
    expect(await livrable("UR", "Audit de sécurité effectué et passé")).toMatchObject({ etat: "en_cours", remarque: "Compléter le point 6" });
  });

  it("équipe, décision, risque, phase : faits puis défaits", async () => {
    const m = await faire("myriam.valcin", "UR ajouter Fabienne à l'équipe comme analyste");
    expect(m).toMatchObject({ ok: true, message: "UR · Fabienne Michel rejoint l'équipe (analyste)." });
    expect(await faire("myriam.valcin", "UR ajouter Fabienne à l'équipe")).toMatchObject({ message: "Fabienne Michel fait déjà partie de l'équipe." });
    expect(await annuler("myriam.valcin", m.annulation)).toMatchObject({ ok: true });
    const [plus] = await D.db.select().from(D.schema.membresProjet).where(and(eq(D.schema.membresProjet.projetId, projets.get("UR")!), eq(D.schema.membresProjet.personneId, qui("fabienne.michel").id)));
    expect(plus).toBeUndefined();

    // Un membre de l'équipe ne tient pas les registres (29 octobre 2026) : la barre le lui dit.
    expect(await faire("ricardo.etienne", "UR décision prise : tests de charge sur 5 000 comptes (comité de pilotage)")).toMatchObject({ message: expect.stringMatching(/Seuls le chef du projet/) });
    expect(await faire("ricardo.etienne", "UR nouveau risque : la DTI retire le serveur de test, probable, impact fort")).toMatchObject({ message: expect.stringMatching(/Seuls le chef du projet/) });
    const d = await faire("myriam.valcin", "UR décision prise : tests de charge sur 5 000 comptes (comité de pilotage)");
    expect(d).toMatchObject({ ok: true, message: "UR · Décision notée au registre : « Tests de charge sur 5 000 comptes » (Comité de pilotage)." });
    expect(await annuler("myriam.valcin", d.annulation)).toMatchObject({ ok: true });

    const k = await faire("myriam.valcin", "UR nouveau risque : la DTI retire le serveur de test, probable, impact fort, suivi par Daphnée");
    expect(k).toMatchObject({ ok: true, message: expect.stringMatching(/critique/) });
    const s = await faire("myriam.valcin", "UR risque serveur de test maîtrisé");
    expect(s).toMatchObject({ ok: true });
    const [risque] = await D.db.select().from(D.schema.risquesProjet).where(eq(D.schema.risquesProjet.titre, "La DTI retire le serveur de test"));
    expect(risque).toMatchObject({ statut: "maitrise", probabilite: 3, impact: 3, responsableId: qui("daphnee.joseph").id });
    expect(await annuler("myriam.valcin", s.annulation)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.risquesProjet).where(eq(D.schema.risquesProjet.id, risque.id)))[0].statut).toBe("ouvert");
    // Son auteur le retire : la base reste comme avant pour les autres tests.
    expect(await annuler("myriam.valcin", k.annulation)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.risquesProjet).where(eq(D.schema.risquesProjet.id, risque.id))).length).toBe(0);

    const ph = await faire("myriam.valcin", "UR terminer la phase");
    expect(ph).toMatchObject({ ok: true, message: "UR · Phase « Validation métier » terminée." });
    expect(await annuler("myriam.valcin", ph.annulation)).toMatchObject({ ok: true });
    expect(await faire("ricardo.etienne", "UR terminer la phase")).toMatchObject({ message: expect.stringMatching(/organisent les phases/) });
  });

  it("sponsor, priorité, budget : par qui gère le projet, et « Annuler » rend l'état d'avant", async () => {
    const avant = await projet("UR");
    const sp = await faire("myriam.valcin", "UR sponsor Nadège Augustin");
    expect(sp).toMatchObject({ ok: true, message: "UR · Sponsor métier : Nadège Augustin (prévenu)." });
    expect((await projet("UR")).sponsorId).toBe(qui("nadege.augustin").id);
    expect(await annuler("myriam.valcin", sp.annulation)).toMatchObject({ ok: true });
    expect((await projet("UR")).sponsorId).toBe(avant.sponsorId);

    const bu = await faire("myriam.valcin", "UR budget 13 M engagé 12,2 M");
    expect(bu).toMatchObject({ ok: true, message: expect.stringMatching(/prévu 13\s000\s000 (?:HTG|USD), engagé 12\s200\s000 (?:HTG|USD) \(94 %\)/) });
    expect(await annuler("myriam.valcin", bu.annulation)).toMatchObject({ ok: true });
    expect(await projet("UR")).toMatchObject({ budgetPrevu: avant.budgetPrevu, budgetEngage: avant.budgetEngage });

    expect(await faire("ricardo.etienne", "UR priorité basse")).toMatchObject({ message: expect.stringMatching(/Seuls le chef de projet/) });
    const pr = await faire("myriam.valcin", "priorité basse", projets.get("UR")!);
    expect(pr).toMatchObject({ ok: true, message: "UR · Priorité basse." });
    expect((await projet("UR")).priorite).toBe("basse");
    expect(await annuler("myriam.valcin", pr.annulation)).toMatchObject({ ok: true });
    expect((await projet("UR")).priorite).toBe(avant.priorite);
  });

  it("créer un projet : une directrice le crée avec son chef ; une chargée de projets le propose ; « Annuler » le retire", async () => {
    const n = await faire("nadege.augustin", "Nouveau projet : Portail fournisseurs code PF chef Daphnée : les achats veulent suivre leurs factures");
    expect(n).toMatchObject({ ok: true, message: "Projet PF « Portail fournisseurs » créé, en cours, avec Daphnée Joseph comme chef de projet." });
    const [pf] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "PF"));
    expect(pf).toMatchObject({ statut: "en_cours", chefProjetId: qui("daphnee.joseph").id, justification: "Les achats veulent suivre leurs factures", dateEntree: "2026-10-30" });
    expect(await annuler("nadege.augustin", n.annulation)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "PF"))).length).toBe(0);

    const d = await faire("daphnee.joseph", "Nouveau projet : Archivage des contrats : les contrats papier se perdent");
    expect(d).toMatchObject({ ok: true, message: expect.stringMatching(/proposé : la direction est prévenue/) });
    expect(await annuler("daphnee.joseph", d.annulation)).toMatchObject({ ok: true });
    expect(await faire("daphnee.joseph", "Nouveau projet : Sans raison")).toMatchObject({ message: expect.stringMatching(/Dites pourquoi/) });
  });

  it("rapports : le ponctuel par une directrice, pas par une chargée de projets ; envoyer son rapport", async () => {
    const r = await faire("nadege.augustin", "rapport ponctuel : point sur UNIBANKOnline : pour le conseil du 15");
    expect(r).toMatchObject({ ok: true, lien: expect.stringMatching(/^\/conseil\/ponctuels\//) });
    expect(await faire("daphnee.joseph", "rapport ponctuel : test")).toMatchObject({ message: expect.stringMatching(/directeur ou un exécutif/) });
    // Envoyer : on ne l'essaie ici que pour quelqu'un qui n'a pas commencé son rapport (l'envoi lui-même est vérifié
    // par le parcours dans le navigateur ; ici, il changerait les rapports dont d'autres tests ont besoin).
    const ecrits = new Set((await D.db.select({ auteurId: D.schema.rapportsHebdo.auteurId }).from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.semaine, "2026-10-26"))).map((x) => x.auteurId));
    const sansRapport = ["thierry.lamy", "guerline.paul", "joel.dorval", "sophonie.charles"].find((c) => qui(c) && !ecrits.has(qui(c).id));
    if (sansRapport) expect(await faire(sansRapport, "envoyer mon rapport")).toMatchObject({ message: expect.stringMatching(/pas encore commencé/), lien: "/rapport" });
    expect(await faire("frantz.desrosiers", "envoyer mon rapport")).toMatchObject({ message: "Vous ne rédigez pas de rapport du vendredi." });
    expect(await faire("daphnee.joseph", "rapport au conseil en Word")).toMatchObject({ ok: true, lien: "/api/conseil/2026-10-01/word" });
  });

  it("clôturer depuis la barre, puis « Annuler » rouvre", async () => {
    const k = await faire("myriam.valcin", "UR clôturer : en ligne pour tous les clients, objectifs en partie");
    expect(k).toMatchObject({ ok: true });
    expect(await projet("UR")).toMatchObject({ statut: "finalise", objectifsAtteints: "en_partie", bilanCloture: "En ligne pour tous les clients" });
    expect(await annuler("myriam.valcin", k.annulation)).toMatchObject({ ok: true });
    expect((await projet("UR")).statut).toBe("en_cours");
  });

  it("« charge de daphnée » : la charge de trois semaines, si on la suit", async () => {
    const r = await Q.repondre(qui("marc-antoine.louis"), "charge de daphnée");
    expect(r.titre).toBe("Charge de Daphnée Joseph");
    expect(r.lignes).toHaveLength(3);
    expect(r.lignes[0].texte).toMatch(/^cette semaine : \d+ h sur \d+(?:,\d)? h restantes$/);
    const refus = await Q.repondre(qui("myriam.valcin"), "charge de Daphnée ?");
    expect(refus.vide).toBe("Vous ne suivez pas la charge de Daphnée Joseph.");
  });
});
