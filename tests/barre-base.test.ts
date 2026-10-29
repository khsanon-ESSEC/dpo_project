/**
 * La barre contre la base de démonstration : notes pour le rapport, mise à jour d'un projet, « Annuler ».
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as BarreModule from "@/lib/donnees/barre";
import type * as AnnulationsModule from "@/lib/donnees/annulations";
import type * as GestionModule from "@/lib/donnees/gestion";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("la barre (base de démonstration)", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let B: typeof BarreModule;
  let N: typeof AnnulationsModule;
  let G: typeof GestionModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (cle: string) => gens.get(cle)!;
  const projets = new Map<string, string>();

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    B = await import("@/lib/donnees/barre");
    N = await import("@/lib/donnees/annulations");
    G = await import("@/lib/donnees/gestion");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      if (!p.courriel) continue;
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });
  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("note pour le rapport : dans le bon champ, avec son projet ; « Annuler » la retire", async () => {
    const dj = qui("daphnee.joseph");
    const r = await B.ajouterNoteAuRapport(dj, { saisie: "Fait marquant : pilote réussi UR", projetId: "" });
    expect(r).toMatchObject({ ok: true, lien: "/rapport" });
    const [rapport] = await D.db.select().from(D.schema.rapportsHebdo).where(and(eq(D.schema.rapportsHebdo.auteurId, dj.id), eq(D.schema.rapportsHebdo.semaine, "2026-10-26")));
    const lignes = await D.db.select().from(D.schema.lignesRapport).where(eq(D.schema.lignesRapport.rapportId, rapport.id));
    const ligne = lignes.find((l) => l.texte === "Pilote réussi");
    expect(ligne).toMatchObject({ partie: "fait", projetId: projets.get("UR") });
    // Une autre personne ne peut pas se servir du jeton.
    expect(await N.annulerAction(await A.acces(qui("myriam.valcin")), r.annulation!)).toHaveProperty("erreur");
    expect(await N.annulerAction(await A.acces(dj), r.annulation!)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.lignesRapport).where(eq(D.schema.lignesRapport.id, ligne!.id))).length).toBe(0);
    // Une seule fois.
    expect(await N.annulerAction(await A.acces(dj), r.annulation!)).toHaveProperty("erreur");
  });

  it("une décision va dans le champ texte « Décision » quand le modèle en a un ; elle s'ajoute à ce qui y est", async () => {
    const dj = qui("daphnee.joseph");
    const r1 = await B.ajouterNoteAuRapport(dj, { saisie: "Décision : valider le budget DTI", projetId: "" });
    const r2 = await B.ajouterNoteAuRapport(dj, { saisie: "Décision : choisir le prestataire", projetId: projets.get("UR")! });
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.message).toMatch(/Décision ou aide attendue/);
    const [rapport] = await D.db.select().from(D.schema.rapportsHebdo).where(and(eq(D.schema.rapportsHebdo.auteurId, dj.id), eq(D.schema.rapportsHebdo.semaine, "2026-10-26")));
    const lire = async () => (await D.db.select().from(D.schema.reponsesRapport).where(and(eq(D.schema.reponsesRapport.rapportId, rapport.id), eq(D.schema.reponsesRapport.champId, "decision"), isNull(D.schema.reponsesRapport.projetId))))[0]?.valeur;
    expect(await lire()).toMatch(/Valider le budget DTI ; UR : Choisir le prestataire$/);
    await N.annulerAction(await A.acces(dj), r2.annulation!);
    expect(await lire()).toMatch(/Valider le budget DTI$/);
  });

  it("rapport déjà parti : la note va dans celui de la semaine prochaine ; un exécutif n'a pas de rapport", async () => {
    const fm = qui("fabienne.michel"); // son rapport de la semaine est envoyé
    expect((await B.ajouterNoteAuRapport(fm, { saisie: "Risque : recette repoussée", projetId: "" })).message).toMatch(/semaine prochaine/);
    expect(await B.ajouterNoteAuRapport(qui("frantz.desrosiers"), { saisie: "Décision : x", projetId: "" })).not.toHaveProperty("ok");
  });

  it("projet : la santé est calculée ; le chef signale un risque (qui ne fait qu'aggraver) ; « Annuler » le retire", async () => {
    const mv = qui("myriam.valcin"); // cheffe du projet UR
    const ur = projets.get("UR")!;
    const S = await import("@/lib/donnees/sante");
    await S.recalculerSante([ur]);
    const [avant] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, ur));
    // Une autre personne ne touche pas au projet ; « en retard » ne s'impose pas, même par la cheffe.
    expect(await B.mettreAJourProjetDepuisBarre(qui("daphnee.joseph"), await A.acces(qui("daphnee.joseph")), { saisie: "UR risque : test", projetId: "" })).not.toHaveProperty("ok");
    const impose = await B.mettreAJourProjetDepuisBarre(mv, await A.acces(mv), { saisie: "UR en retard : test", projetId: "" });
    expect(impose).not.toHaveProperty("ok");
    expect(impose.message).toMatch(/calculée/);
    const r = await B.mettreAJourProjetDepuisBarre(mv, await A.acces(mv), { saisie: "UR à surveiller : retard du prestataire", projetId: "" });
    expect(r).toMatchObject({ ok: true });
    const [apres] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, ur));
    expect(apres.risqueMotif).toBe("Retard du prestataire");
    expect(apres.santeMotif).toContain("Risque signalé par Myriam Valcin : Retard du prestataire");
    expect(apres.sante).not.toBe("dans_les_temps");
    if (avant.sante === "en_retard") expect(apres.sante).toBe("en_retard"); // le signal n'améliore jamais
    expect(await N.annulerAction(await A.acces(mv), r.annulation!)).toMatchObject({ ok: true });
    const [retour] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, ur));
    expect({ risqueMotif: retour.risqueMotif, sante: retour.sante, santeMotif: retour.santeMotif }).toEqual({ risqueMotif: "", sante: avant.sante, santeMotif: avant.santeMotif });
  });

  it("jalon daté, avec « projet … » en toutes lettres ; « Annuler » le retire", async () => {
    const mv = qui("myriam.valcin");
    const r = await B.mettreAJourProjetDepuisBarre(mv, await A.acces(mv), { saisie: "projet retail jalon recette utilisateurs 15/11", projetId: "" });
    expect(r).toMatchObject({ ok: true });
    const [j] = await D.db.select().from(D.schema.indicateurs).where(and(eq(D.schema.indicateurs.projetId, projets.get("UR")!), eq(D.schema.indicateurs.libelle, "Recette utilisateurs")));
    expect(j.prevuLe).toBe("2026-11-15");
    await N.annulerAction(await A.acces(mv), r.annulation!);
    expect((await D.db.select().from(D.schema.indicateurs).where(eq(D.schema.indicateurs.id, j.id))).length).toBe(0);
  });

  it("« Annuler » une tâche ajoutée, et une mise à jour (sauf si la tâche a changé depuis)", async () => {
    const mv = qui("myriam.valcin");
    const a = await A.acces(mv);
    const depuis = new Date().toISOString();
    const c = await G.creerTacheGeree(a, { titre: "Tâche à annuler", description: "", projetId: projets.get("UR")!, assigneId: qui("fabienne.michel").id, echeance: null, debut: null, estimationHeures: null });
    if ("erreur" in c) throw new Error(c.erreur);
    const jeton = await N.enregistrerAnnulation(mv.id, { genre: "tache_creee", tacheId: c.id, depuis });
    expect(await N.annulerAction(a, jeton)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, c.id))).length).toBe(0);
    // Mise à jour : rétablie seulement si personne n'y a touché depuis.
    const [t] = await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.assigneId, mv.id), isNull(D.schema.taches.annuleeLe))).limit(1);
    const maj = new Date();
    await D.db.update(D.schema.taches).set({ statut: "faite", termineeLe: maj, majLe: maj }).where(eq(D.schema.taches.id, t.id));
    const avant = { statut: t.statut, blocage: t.blocage, termineeLe: null, echeance: t.echeance, estimationHeures: t.estimationHeures, assigneId: t.assigneId, projetId: t.projetId };
    const j1 = await N.enregistrerAnnulation(mv.id, { genre: "tache_maj", tacheId: t.id, depuis: maj.toISOString(), apresMajLe: maj.toISOString(), avant });
    expect(await N.annulerAction(a, j1)).toMatchObject({ ok: true });
    expect((await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, t.id)))[0].statut).toBe(t.statut);
    const j2 = await N.enregistrerAnnulation(mv.id, { genre: "tache_maj", tacheId: t.id, depuis: maj.toISOString(), apresMajLe: new Date(0).toISOString(), avant });
    expect(await N.annulerAction(a, j2)).toMatchObject({ erreur: expect.stringMatching(/a changé depuis/) });
  });

  it("« Annuler » une tâche qui avait fait entrer quelqu'un dans l'équipe du projet : il en ressort", async () => {
    const mv = qui("myriam.valcin");
    const a = await A.acces(mv);
    const ur = projets.get("UR")!;
    const membres = new Set((await D.db.select({ id: D.schema.membresProjet.personneId }).from(D.schema.membresProjet).where(eq(D.schema.membresProjet.projetId, ur))).map((m) => m.id));
    const { personnes, base } = await G.assignables(a);
    const nouveau = personnes.find((p) => base.includes(p.id) && p.id !== mv.id && !membres.has(p.id));
    expect(nouveau).toBeTruthy();
    const depuis = new Date().toISOString();
    const c = await G.creerTacheGeree(a, { titre: "Tâche qui fait entrer", description: "", projetId: ur, assigneId: nouveau!.id, echeance: null, debut: null, estimationHeures: null });
    if ("erreur" in c) throw new Error(c.erreur);
    const estMembre = async () => (await D.db.select().from(D.schema.membresProjet).where(and(eq(D.schema.membresProjet.projetId, ur), eq(D.schema.membresProjet.personneId, nouveau!.id)))).length === 1;
    expect(await estMembre()).toBe(true);
    const jeton = await N.enregistrerAnnulation(mv.id, { genre: "tache_creee", tacheId: c.id, depuis });
    expect(await N.annulerAction(a, jeton)).toMatchObject({ ok: true });
    expect(await estMembre()).toBe(false);
  });

  it("« Annuler » refuse ce qui a changé depuis : un jalon déjà atteint", async () => {
    const mv = qui("myriam.valcin");
    const r = await B.mettreAJourProjetDepuisBarre(mv, await A.acces(mv), { saisie: "projet retail jalon mise en production 30/11", projetId: "" });
    expect(r).toMatchObject({ ok: true });
    const [j] = await D.db.select().from(D.schema.indicateurs).where(and(eq(D.schema.indicateurs.projetId, projets.get("UR")!), eq(D.schema.indicateurs.libelle, "Mise en production")));
    await D.db.update(D.schema.indicateurs).set({ etat: "atteint" }).where(eq(D.schema.indicateurs.id, j.id));
    expect(await N.annulerAction(await A.acces(mv), r.annulation!)).toMatchObject({ erreur: expect.stringMatching(/a changé depuis/) });
    expect((await D.db.select().from(D.schema.indicateurs).where(eq(D.schema.indicateurs.id, j.id))).length).toBe(1);
  });

  it("questions : réponses selon ce que la personne voit", async () => {
    const Q = await import("@/lib/donnees/questions");
    const mv = qui("myriam.valcin");
    const retard = await Q.repondre(mv, "en retard sur UR ?");
    expect(retard.titre).toBe("Tâches en retard sur UR");
    expect(retard.lignes.every((l) => l.code === "UR" && l.lien.startsWith("/taches/"))).toBe(true);
    const rapports = await Q.repondre(mv, "qui n'a pas envoyé son rapport ?");
    expect(rapports.titre).toMatch(/Rapports pas encore envoyés/);
    expect(rapports.lignes.every((l) => l.lien.startsWith("/equipe/rapports?personne="))).toBe(true);
    expect((await Q.repondre(mv, "projets à surveiller ?")).titre).toBe("Projets à surveiller ou en retard");
    expect((await Q.repondre(mv, "quel temps fait-il ?")).incomprise).toBe(true);
    // Une personne hors division ne voit que ses tâches, même en demandant celles d'un projet.
    const nc = qui("nathalie.celestin");
    const sienne = await Q.repondre(nc, "mes échéances du mois ?");
    expect(sienne.lignes.every((l) => !/Pour /.test(l.sous ?? ""))).toBe(true);
    expect((await Q.repondre(nc, "qui est surchargé ?")).vide).toMatch(/division/);
    // Un code de projet qu'on ne voit pas : « introuvable », rien de plus.
    expect((await Q.repondre(qui("daphnee.joseph"), "en retard sur CR ?")).titre).toMatch(/introuvable|CR/);
  });
});
