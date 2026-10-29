/**
 * Lot 4, contre la base de démonstration : sponsor métier, priorité, budget, clôture, tâches récurrentes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as ClotureModule from "@/lib/donnees/cloture";
import type * as RecurrenceModule from "@/lib/donnees/recurrence";
import type * as SemaineModule from "@/lib/donnees/semaine";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("sponsor, priorité, budget, clôture, tâches récurrentes", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let C: typeof ClotureModule;
  let R: typeof RecurrenceModule;
  let SE: typeof SemaineModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const tache = async (code: string, titre: string) => (await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.projetId, projets.get(code)!), eq(D.schema.taches.titre, titre))))[0];
  const projet = async (code: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get(code)!)))[0];
  /** Les champs du formulaire « Modifier le projet », tels qu'ils sont. */
  const champs = (p: Awaited<ReturnType<typeof projet>>) => ({
    code: p.code,
    titre: p.titre,
    description: p.description,
    programme: p.programme,
    strategique: p.strategique,
    statut: p.statut as string,
    chefProjetId: p.chefProjetId ?? "",
    referentId: p.referentId ?? "",
    division: p.division,
    dateEntree: p.dateEntree ?? "",
    dateFinInitiale: p.dateFinInitiale ?? "",
    dateFinPrevue: p.dateFinPrevue ?? "",
    dateLancementPrevue: p.dateLancementPrevue ?? "",
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    C = await import("@/lib/donnees/cloture");
    R = await import("@/lib/donnees/recurrence");
    SE = await import("@/lib/donnees/semaine");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("sponsor métier : nommé par qui gère le projet, prévenu, il voit le projet ; priorité du projet", async () => {
    const un = projets.get("UN")!;
    const gp = qui("guerline.paul");
    const avant = await A.idsProjetsVisibles(await acces("guerline.paul"));
    expect(avant !== "tous" && avant.has(un)).toBe(false);
    const p = await projet("UN");
    expect(await G.modifierProjet(un, { ...champs(p), sponsorId: gp.id, priorite: "haute" }, qui("ludovic.pierre").id)).toEqual({ ok: true });
    const apres = await projet("UN");
    expect(apres).toMatchObject({ sponsorId: gp.id, priorite: "haute" });
    const vus = await A.idsProjetsVisibles(await acces("guerline.paul"));
    expect(vus !== "tous" && vus.has(un)).toBe(true);
    const [n] = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, gp.id), eq(D.schema.notifications.lien, `/projets/${un}`)));
    expect(n?.texte).toBe("Vous êtes le sponsor métier du projet « Refonte Uninet »");
    // Un formulaire sans ces champs ne les change pas ; « finalisé » ne se choisit plus ici (c'est la clôture).
    expect(await G.modifierProjet(un, { ...champs(apres), statut: "finalise" }, qui("ludovic.pierre").id)).toEqual({ ok: true });
    expect(await projet("UN")).toMatchObject({ sponsorId: gp.id, priorite: "haute", statut: "en_cours" });
  });

  it("priorité d'une tâche : à la création, modifiée (notée dans l'histoire), et haute d'abord dans « À faire »", async () => {
    const mv = await acces("myriam.valcin");
    const r = await G.creerTacheGeree(mv, { titre: "Relire le plan de bascule", description: "", projetId: projets.get("UR")!, assigneId: qui("myriam.valcin").id, echeance: "2026-11-20", debut: null, estimationHeures: 2, priorite: "haute" });
    expect(r).toHaveProperty("id");
    const id = (r as { id: string }).id;
    let [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, id));
    expect(t.priorite).toBe("haute");
    expect(await G.modifierDefinitionTache(mv, t, { titre: t.titre, description: "", projetId: t.projetId, assigneId: t.assigneId, priorite: "basse" })).toEqual({ ok: true });
    [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, id));
    expect(t.priorite).toBe("basse");
    const ev = await D.db.select().from(D.schema.evenementsTache).where(and(eq(D.schema.evenementsTache.tacheId, id), eq(D.schema.evenementsTache.type, "priorite")));
    expect(ev[0]).toMatchObject({ avant: "haute", apres: "basse" });
    // Sans le champ (la barre, un ancien formulaire), la priorité ne change pas ; une valeur inconnue devient « normale ».
    expect(await G.modifierDefinitionTache(mv, t, { titre: "Relire le plan de bascule (v2)", description: "", projetId: t.projetId, assigneId: t.assigneId })).toEqual({ ok: true });
    [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, id));
    expect(t.priorite).toBe("basse");
    // Tri : à état égal, la priorité haute passe devant l'échéance.
    const l = SE.trier(
      [
        { id: "a", titre: "a", statut: "a_faire", echeance: "2026-11-02", projetId: null, projetCode: null, projetTitre: null, assigneId: "x", priorite: "normale" },
        { id: "b", titre: "b", statut: "a_faire", echeance: "2026-11-20", projetId: null, projetCode: null, projetTitre: null, assigneId: "x", priorite: "haute" },
      ],
      "2026-10-30",
    );
    expect(l.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("budget : tenu par qui gère le projet, pas par un membre", async () => {
    const ur = projets.get("UR")!;
    expect(await C.enregistrerBudget(await acces("ricardo.etienne"), ur, { prevu: 1, engage: 1, devise: "HTG", note: "" })).toHaveProperty("erreur");
    expect(await C.enregistrerBudget(await acces("myriam.valcin"), ur, { prevu: 13_000_000, engage: null, devise: "USD", note: "  Après avenant  " })).toEqual({ ok: true });
    expect(await projet("UR")).toMatchObject({ budgetPrevu: 13_000_000, budgetEngage: null, budgetDevise: "USD", budgetNote: "Après avenant", budgetMajLe: "2026-10-30" });
  });

  it("clôture : bilan et objectifs exigés ; le projet passe finalisé, l'équipe est prévenue ; il se rouvre", async () => {
    const pr = projets.get("PR")!;
    const dj = await acces("daphnee.joseph");
    expect(await C.cloturerProjet(await acces("sophonie.charles"), pr, { clotureLe: null, bilan: "Un bilan assez long", objectifs: "oui", lecons: "" })).toHaveProperty("erreur");
    expect(await C.cloturerProjet(dj, pr, { clotureLe: null, bilan: "court", objectifs: "oui", lecons: "" })).toEqual({ erreur: "Écrivez le bilan du projet en quelques phrases : ce qui a été livré, ce qui ne l'a pas été." });
    expect(await C.cloturerProjet(dj, pr, { clotureLe: null, bilan: "La plateforme est en ligne.", objectifs: "", lecons: "" })).toEqual({ erreur: "Dites si les objectifs du projet sont atteints." });
    expect(await C.cloturerProjet(dj, pr, { clotureLe: "2026-11-15", bilan: "La plateforme est en ligne.", objectifs: "oui", lecons: "" })).toHaveProperty("erreur");
    const etat = await C.etatAvantCloture(pr);
    expect(etat.tachesOuvertes).toBeGreaterThan(0);
    expect(await C.cloturerProjet(dj, pr, { clotureLe: "2026-10-29", bilan: "La plateforme est en ligne ; le module d'entretien reste à faire.", objectifs: "en_partie", lecons: "Valider le cahier des charges avec la DRH plus tôt." })).toEqual({ ok: true });
    expect(await projet("PR")).toMatchObject({ statut: "finalise", clotureLe: "2026-10-29", clotureParId: qui("daphnee.joseph").id, objectifsAtteints: "en_partie" });
    const notes = await D.db.select().from(D.schema.notifications).where(eq(D.schema.notifications.lien, `/projets/${pr}#cloture`));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.personneId === qui("daphnee.joseph").id)).toBe(false);
    // Clôturé : il ne reçoit plus de tâches, et ne se clôture pas deux fois.
    expect(await G.creerTacheGeree(dj, { titre: "Encore une", description: "", projetId: pr, assigneId: qui("daphnee.joseph").id, echeance: null, debut: null, estimationHeures: null })).toHaveProperty("erreur");
    expect(await C.cloturerProjet(dj, pr, { clotureLe: null, bilan: "La plateforme est en ligne.", objectifs: "oui", lecons: "" })).toHaveProperty("erreur");
    expect(await C.rouvrirProjet(dj, pr)).toEqual({ ok: true });
    expect(await projet("PR")).toMatchObject({ statut: "en_cours", clotureLe: null, bilanCloture: "La plateforme est en ligne ; le module d'entretien reste à faire." });
  });

  it("tâche récurrente : la règle, l'occurrence créée quelques jours avant, pas de doublon, pas de rattrapage, arrêt", async () => {
    const ml = await acces("marc-antoine.louis");
    const t = await tache("UC", "Revue d'architecture avec le prestataire"); // échéance : mardi 3 novembre 2026
    expect(t.echeance).toBe("2026-11-03");
    expect(await R.repeterTache(await acces("sophonie.charles"), t, "semaine:2")).toHaveProperty("erreur");
    expect(await R.repeterTache(ml, t, "chaque mardi")).toHaveProperty("erreur");
    const r = await R.repeterTache(ml, t, "semaine:2");
    expect(r).toHaveProperty("id");
    const id = (r as { id: string }).id;
    const [regle] = await D.db.select().from(D.schema.tachesRecurrentes).where(eq(D.schema.tachesRecurrentes.id, id));
    expect(regle).toMatchObject({ frequence: "semaine", jour: 2, prochaineLe: "2026-11-10", titre: t.titre, assigneId: t.assigneId });
    expect((await tache("UC", "Revue d'architecture avec le prestataire")).recurrenceId).toBe(id);
    expect(await R.repeterTache(ml, { ...t, recurrenceId: id }, "semaine:3")).toEqual({ erreur: "Cette tâche se répète déjà : arrêtez la répétition pour en changer le rythme." });
    const occurrences = async () => D.db.select().from(D.schema.taches).where(eq(D.schema.taches.recurrenceId, id));
    // Le 30 octobre : trop tôt pour celle du 10 novembre.
    expect(await R.genererOccurrences("2026-10-30", id)).toBe(0);
    // Le 4 novembre (six jours avant) : créée, une seule fois.
    expect(await R.genererOccurrences("2026-11-04", id)).toBe(1);
    expect(await R.genererOccurrences("2026-11-04", id)).toBe(0);
    let l = await occurrences();
    expect(l.map((x) => x.echeance).sort()).toEqual(["2026-11-03", "2026-11-10"]);
    expect(l.find((x) => x.echeance === "2026-11-10")).toMatchObject({ statut: "a_faire", assigneId: t.assigneId, projetId: t.projetId, creeParId: qui("marc-antoine.louis").id });
    // Serveur arrêté jusqu'au 1er décembre : seule celle du mardi 1er décembre est créée.
    expect(await R.genererOccurrences("2026-12-01", id)).toBe(1);
    l = await occurrences();
    expect(l.map((x) => x.echeance).sort()).toEqual(["2026-11-03", "2026-11-10", "2026-12-01"]);
    // Arrêt : plus rien.
    expect(await R.arreterRepetition(ml, t)).toEqual({ erreur: "Cette tâche ne se répète pas." }); // l'ancienne lecture
    expect(await R.arreterRepetition(ml, await tache("UC", "Revue d'architecture avec le prestataire"))).toEqual({ ok: true });
    expect(await R.genererOccurrences("2026-12-07", id)).toBe(0);
  });

  it("tâche récurrente : la règle s'arrête d'elle-même si le projet est clôturé", async () => {
    const lp = await acces("ludovic.pierre");
    const t = await tache("UN", "Point hebdomadaire avec la DTI");
    const regle = await R.regleDe(t);
    expect(regle).toMatchObject({ frequence: "semaine", jour: 3 });
    await D.db.update(D.schema.projets).set({ statut: "finalise" }).where(eq(D.schema.projets.id, projets.get("UN")!));
    expect(await R.genererOccurrences("2026-11-06", regle!.id)).toBe(0);
    expect((await R.regleDe(t))?.arreteeLe).not.toBeNull();
    await D.db.update(D.schema.projets).set({ statut: "en_cours" }).where(eq(D.schema.projets.id, projets.get("UN")!));
    expect(lp.moi.id).toBe(qui("ludovic.pierre").id);
  });
});
