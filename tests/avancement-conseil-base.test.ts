/**
 * État d'avancement écrit par le chef de projet pour le rapport mensuel au conseil (29 octobre 2026), contre la base
 * de démonstration : qui l'écrit, jusqu'à quand, comment le rapport le reprend, et les rappels.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as AvModule from "@/lib/donnees/avancement-conseil";
import type * as ConseilModule from "@/lib/donnees/conseil";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;
const NOV = "2026-11-01";

describe.skipIf(!URL_TEST)("rapport au conseil : l'état d'avancement du chef de projet", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let AV: typeof AvModule;
  let C: typeof ConseilModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const alertes = async (courriel: string, cle: string) =>
    D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, qui(courriel).id), like(D.schema.notifications.cle, cle)));
  const texteUR = "Audit de sécurité passé ; correctifs des points 4 à 6 en cours, contre-audit prévu mi-novembre.";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    AV = await import("@/lib/donnees/avancement-conseil");
    C = await import("@/lib/donnees/conseil");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    // La base reste comme avant pour les autres fichiers de tests.
    await D.db.delete(D.schema.avancementsConseil).where(eq(D.schema.avancementsConseil.mois, NOV));
    await D.db.delete(D.schema.rapportsConseil).where(eq(D.schema.rapportsConseil.mois, NOV));
    await D.db.delete(D.schema.notifications).where(like(D.schema.notifications.cle, "conseil_%:2026-11%"));
    await globalThis.__pgClient?.end();
  });

  it("la cheffe de projet écrit jusqu'au jour limite ; un membre, non ; un projet non stratégique n'a pas de ligne", async () => {
    const ur = projets.get("UR")!;
    expect(await AV.enregistrerAvancement(await acces("ricardo.etienne"), ur, texteUR, "2026-11-10")).toEqual({ erreur: "Seuls le chef du projet, son référent, son directeur et les exécutifs écrivent son état d'avancement." });
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), ur, "Court.", "2026-11-10")).toEqual({ erreur: "Écrivez l'état d'avancement en une ou deux phrases." });
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), ur, "Une première version de l'état d'avancement.", "2026-11-10")).toEqual({ ok: true });
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), ur, texteUR, "2026-11-19")).toEqual({ ok: true });
    const [x] = await D.db.select().from(D.schema.avancementsConseil).where(and(eq(D.schema.avancementsConseil.projetId, ur), eq(D.schema.avancementsConseil.mois, NOV)));
    expect(x).toMatchObject({ texte: texteUR, majParId: qui("myriam.valcin").id });
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), ur, texteUR, "2026-11-20")).toEqual({
      erreur: expect.stringMatching(/^L'état d'avancement de novembre est figé depuis le .*19 novembre 2026 au soir/),
    });
    expect(await AV.enregistrerAvancement(await acces("daphnee.joseph"), projets.get("PR")!, texteUR, "2026-11-10")).toHaveProperty("erreur");
    // La fiche du projet : ouvert avant le jour limite, figé après.
    const [p] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, ur));
    expect(await AV.avancementPourProjet(await acces("myriam.valcin"), p, "2026-11-18")).toMatchObject({ peutEcrire: true, fige: false, ecrit: { texte: texteUR, par: "Myriam Valcin" }, cal: { limiteChefs: "2026-11-19", dernierJeudi: "2026-11-26" } });
    expect(await AV.avancementPourProjet(await acces("myriam.valcin"), p, "2026-11-20")).toMatchObject({ peutEcrire: false, fige: true });
    expect(await AV.avancementPourProjet(await acces("ricardo.etienne"), p, "2026-11-18")).toBeNull();
    // Avant d'écrire, un texte automatique est proposé (UC, Marc-Antoine).
    const [uc] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get("UC")!));
    expect((await AV.avancementPourProjet(await acces("marc-antoine.louis"), uc, "2026-11-18"))?.propose).toMatch(/livrables validés sur/);
  });

  it("le rapport reprend le texte du chef ; une correction de la direction l'emporte ensuite", async () => {
    const r = await C.obtenirOuCreerRapportConseil(NOV);
    let lignes = await C.lignesConseil(r.id, r.statut);
    const ur = lignes.find((l) => l.projet.code === "UR")!;
    expect(ur.ligne).toMatchObject({ etatAvancement: texteUR, source: "chef", sourceParId: qui("myriam.valcin").id });
    expect(ur.auteurEtat).toBe("Myriam Valcin");
    expect(lignes.find((l) => l.projet.code === "UC")!.ligne.source).toBe("regles");
    // La direction corrige : sa version reste, même si la cheffe réécrit ensuite.
    await C.modifierEtat(ur.ligne.id, "Version de la direction pour le conseil.", qui("frantz.desrosiers").id);
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), projets.get("UR")!, "Nouvelle version de la cheffe de projet, plus récente.", "2026-11-18")).toEqual({ ok: true });
    lignes = await C.lignesConseil(r.id, r.statut);
    expect(lignes.find((l) => l.projet.code === "UR")!.ligne).toMatchObject({ etatAvancement: "Version de la direction pour le conseil.", source: "direction" });
    const [p] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get("UR")!));
    expect((await AV.avancementPourProjet(await acces("myriam.valcin"), p, "2026-11-18"))?.corrige).toEqual({ texte: "Version de la direction pour le conseil.", par: "Frantz Desrosiers" });
    // Le chef de CE écrit après la création du rapport : sa ligne suit.
    expect(await AV.enregistrerAvancement(await acces("wesner.bazile"), projets.get("CE")!, "Paramétrage terminé, formation des agences à partir du 23 novembre.", "2026-11-18")).toEqual({ ok: true });
    lignes = await C.lignesConseil(r.id, r.statut);
    expect(lignes.find((l) => l.projet.code === "CE")!.ligne).toMatchObject({ etatAvancement: "Paramétrage terminé, formation des agences à partir du 23 novembre.", source: "chef" });
  });

  it("rappels : le vendredi d'avant, la relance la veille, puis « prêt à valider » aux exécutifs ; une seule fois chacun", async () => {
    expect(await AV.rappelsConseil("2026-11-12")).toEqual({ rappels: 0, executifs: 0 });
    await AV.rappelsConseil("2026-11-13");
    // Marc-Antoine (UC) n'a rien écrit : rappel ; Myriam (UR) et Wesner (CE) ont écrit : rien.
    expect(await alertes("marc-antoine.louis", "conseil_rappel:2026-11:%")).toEqual([expect.objectContaining({ lien: `/projets/${projets.get("UC")}#conseil`, texte: expect.stringMatching(/avant le .*19 novembre 2026 au soir/) })]);
    expect((await alertes("myriam.valcin", "conseil_%:2026-11:%")).map((x) => x.texte)).toEqual([]);
    expect(await alertes("wesner.bazile", "conseil_%:2026-11:%")).toEqual([]);
    await AV.rappelsConseil("2026-11-16");
    expect(await alertes("marc-antoine.louis", "conseil_%:2026-11:%")).toHaveLength(1);
    await AV.rappelsConseil("2026-11-18");
    expect(await alertes("marc-antoine.louis", "conseil_relance:2026-11:%")).toEqual([expect.objectContaining({ texte: expect.stringMatching(/il se fige demain/) })]);
    await AV.rappelsConseil("2026-11-20");
    await AV.rappelsConseil("2026-11-23");
    expect(await alertes("frantz.desrosiers", "conseil_pret:2026-11")).toEqual([expect.objectContaining({ lien: "/conseil", texte: expect.stringMatching(/prêt à valider : 2 projets sur 3 mis à jour par leur chef ; à envoyer avant le .*26 novembre 2026/) })]);
    expect(await alertes("marc-antoine.louis", "conseil_%:2026-11%")).toHaveLength(2);
  });

  it("rapport approuvé : plus rien ne s'écrit, plus de rappel", async () => {
    await D.db.update(D.schema.rapportsConseil).set({ statut: "approuve" }).where(eq(D.schema.rapportsConseil.mois, NOV));
    expect(await AV.enregistrerAvancement(await acces("myriam.valcin"), projets.get("UR")!, texteUR, "2026-11-12")).toEqual({ erreur: "Le rapport de novembre est déjà approuvé : son état d'avancement est figé." });
    expect(await AV.rappelsConseil("2026-11-24")).toEqual({ rappels: 0, executifs: 0 });
  });
});
