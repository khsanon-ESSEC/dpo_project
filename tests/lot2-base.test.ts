/**
 * Lot 2, contre la base de démonstration : registre des décisions d'un projet, dépendances entre tâches.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as DecisionsModule from "@/lib/donnees/decisions";
import type * as DependancesModule from "@/lib/donnees/dependances";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("décisions et dépendances", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let DE: typeof DecisionsModule;
  let DP: typeof DependancesModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const tache = async (code: string, titre: string) => (await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.projetId, projets.get(code)!), eq(D.schema.taches.titre, titre))))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    DE = await import("@/lib/donnees/decisions");
    DP = await import("@/lib/donnees/dependances");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("registre : un membre note une décision ; quelqu'un hors de l'équipe, non ; la date ne peut pas être future", async () => {
    const ur = projets.get("UR")!;
    const avant = (await DE.decisionsDuProjet(ur)).length;
    const re = await acces("ricardo.etienne"); // membre de l'équipe d'UR
    const r = await DE.noterDecision(re, ur, { texte: "  les tests de charge se font sur 2 000 comptes ", decideeLe: "2026-10-29", instance: "Comité de pilotage", contexte: "" });
    expect(r).toMatchObject({ ok: true });
    const l = await DE.decisionsDuProjet(ur);
    expect(l).toHaveLength(avant + 1);
    expect(l[0]).toMatchObject({ texte: "Les tests de charge se font sur 2 000 comptes", decideeLe: "2026-10-29", auteur: "Ricardo Étienne" });
    expect(await DE.noterDecision(await acces("sophonie.charles"), ur, { texte: "Hors équipe", decideeLe: "", instance: "", contexte: "" })).toHaveProperty("erreur");
    expect(await DE.noterDecision(re, ur, { texte: "Plus tard", decideeLe: "2027-01-01", instance: "", contexte: "" })).toEqual({ erreur: "Une décision se note une fois prise : sa date ne peut pas être dans le futur." });
    expect(await DE.noterDecision(re, ur, { texte: " ", decideeLe: "", instance: "", contexte: "" })).toEqual({ erreur: "Écrivez la décision." });
  });

  it("registre : l'auteur corrige ; un autre membre, non ; la cheffe de projet retire", async () => {
    const ur = projets.get("UR")!;
    const [d] = (await DE.decisionsDuProjet(ur)).filter((x) => x.auteur === "Ricardo Étienne");
    expect(await DE.modifierDecision(await acces("ricardo.etienne"), ur, d.id, { texte: "Les tests de charge se font sur 5 000 comptes", decideeLe: d.decideeLe, instance: d.instance, contexte: "Volume de la première vague" })).toEqual({ ok: true });
    expect(await DE.modifierDecision(await acces("daphnee.joseph"), ur, d.id, { texte: "Autre", decideeLe: d.decideeLe, instance: "", contexte: "" })).toHaveProperty("erreur");
    expect(await DE.retirerDecision(await acces("myriam.valcin"), ur, d.id)).toEqual({ ok: true });
    expect((await DE.decisionsDuProjet(ur)).some((x) => x.id === d.id)).toBe(false);
    expect(await DE.instancesConnues()).toEqual(expect.arrayContaining(["Comité de pilotage", "Direction de la division"]));
  });

  it("dépendances : même projet seulement, pas de boucle ; la suivante est prévenue quand la précédente est faite", async () => {
    const mv = await acces("myriam.valcin");
    const validation = await tache("UR", "Validation métier des correctifs de l'audit");
    const correctifs = await tache("UR", "Correctifs de sécurité (points 4 à 6)");
    const ench = await DP.enchainementDe(validation);
    expect(ench.precedentes.map((x) => x.titre)).toEqual(expect.arrayContaining(["Correctifs de sécurité (points 4 à 6)", "Contre-audit de sécurité (points 4 à 6)"]));
    expect(ench.attend).toHaveLength(2);
    // Boucle : les correctifs ne peuvent pas attendre la validation, qui les attend déjà.
    expect(await DP.ajouterDependance(mv, correctifs, validation.id)).toEqual({ erreur: "Cette dépendance ferait une boucle : cette tâche-là attend déjà celle-ci." });
    // Une tâche d'un autre projet est refusée.
    const autre = await tache("CR", "Serveur de test");
    expect(await DP.ajouterDependance(mv, correctifs, autre.id)).toEqual({ erreur: "Choisissez une tâche du même projet." });
    // Les possibles n'offrent ni la tâche elle-même, ni ce qui ferait une boucle.
    const possibles = await DP.precedentesPossibles(correctifs);
    expect(possibles.some((x) => x.id === validation.id || x.id === correctifs.id)).toBe(false);
    // La précédente faite : la personne de la suivante est prévenue quand plus rien ne la retient.
    const contre = await tache("UR", "Contre-audit de sécurité (points 4 à 6)");
    await D.db.update(D.schema.taches).set({ statut: "faite", termineeLe: new Date() }).where(eq(D.schema.taches.id, correctifs.id));
    expect(await DP.prevenirSuivantes(correctifs.id, mv.moi.id)).toBe(0); // le contre-audit n'est pas fait
    await D.db.update(D.schema.taches).set({ statut: "faite", termineeLe: new Date() }).where(eq(D.schema.taches.id, contre.id));
    expect(await DP.prevenirSuivantes(contre.id, mv.moi.id)).toBe(1);
    const alertes = await D.db.select().from(D.schema.notifications).where(eq(D.schema.notifications.personneId, qui("daphnee.joseph").id));
    expect(alertes.some((n) => n.texte.includes("vous pouvez commencer « Validation métier des correctifs de l'audit »"))).toBe(true);
    // Retour à l'état de démonstration.
    await D.db.update(D.schema.taches).set({ statut: correctifs.statut, termineeLe: null }).where(eq(D.schema.taches.id, correctifs.id));
    await D.db.update(D.schema.taches).set({ statut: contre.statut, termineeLe: null }).where(eq(D.schema.taches.id, contre.id));
  });

  it("dépendances : qui ne peut pas modifier la tâche ne lui ajoute pas de précédente", async () => {
    const lp = await acces("ludovic.pierre");
    const validation = await tache("UR", "Validation métier des correctifs de l'audit");
    const plan = await tache("UR", "Plan de lancement révisé");
    expect(await DP.ajouterDependance(lp, validation, plan.id)).toEqual({ erreur: "Vous ne pouvez pas modifier cette tâche." });
    const mv = await acces("myriam.valcin");
    expect(await DP.ajouterDependance(mv, validation, plan.id)).toEqual({ ok: true });
    expect(await DP.retirerDependance(mv, validation, plan.id)).toEqual({ ok: true });
  });
});
