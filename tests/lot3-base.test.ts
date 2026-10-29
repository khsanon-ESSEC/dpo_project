/**
 * Lot 3, contre la base de démonstration : registre des risques, phases, temps passé.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as RisquesModule from "@/lib/donnees/risques";
import type * as TempsModule from "@/lib/donnees/temps";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("risques, phases et temps passé", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let R: typeof RisquesModule;
  let T: typeof TempsModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const tache = async (code: string, titre: string) => (await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.projetId, projets.get(code)!), eq(D.schema.taches.titre, titre))))[0];
  const sante = async (code: string) => (await D.db.select({ sante: D.schema.projets.sante, motif: D.schema.projets.santeMotif }).from(D.schema.projets).where(eq(D.schema.projets.id, projets.get(code)!)))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    R = await import("@/lib/donnees/risques");
    T = await import("@/lib/donnees/temps");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("risques : un membre note un risque critique, la santé le dit ; maîtrisé, il ne compte plus", async () => {
    const cr = projets.get("CR")!; // Refonte Credos : dans les temps, un risque modéré au registre
    const avant = await sante("CR");
    expect(avant.motif ?? "").not.toMatch(/risque critique/);
    const membre = await acces("wesner.bazile"); // chef de projet de Credos
    const r = await R.enregistrerRisque(membre, cr, null, { titre: "  la DTI retire le serveur de test ", description: "", probabilite: "3", impact: 3, responsableId: qui("wesner.bazile").id, reponse: "Demander un engagement écrit", revueLe: "2026-11-06" });
    expect(r).toMatchObject({ ok: true });
    const id = (r as { id: string }).id;
    const l = await R.risquesDuProjet(cr);
    expect(l[0]).toMatchObject({ id, titre: "La DTI retire le serveur de test", probabilite: 3, impact: 3, statut: "ouvert", responsable: "Wesner Bazile" });
    expect((await sante("CR")).motif).toMatch(/1 risque critique ouvert au registre/);
    expect(await R.changerStatutRisque(membre, cr, id, "maitrise")).toEqual({ ok: true });
    expect((await sante("CR")).motif ?? "").not.toMatch(/risque critique/);
    // Un statut inconnu redevient « ouvert » ; un niveau inconnu, « moyen ».
    expect(await R.changerStatutRisque(membre, cr, id, "n'importe quoi")).toEqual({ ok: true });
    expect((await R.risquesDuProjet(cr)).find((x) => x.id === id)?.statut).toBe("ouvert");
    expect(await R.enregistrerRisque(membre, cr, id, { titre: "La DTI retire le serveur de test", description: "", probabilite: 9, impact: "x", responsableId: null, reponse: "", revueLe: null })).toMatchObject({ ok: true });
    expect((await R.risquesDuProjet(cr)).find((x) => x.id === id)).toMatchObject({ probabilite: 2, impact: 2, responsableId: null });
    // Retirer : l'auteur ou qui gère le projet.
    expect(await R.retirerRisque(membre, cr, id)).toEqual({ ok: true });
  });

  it("risques : quelqu'un hors de l'équipe ne tient pas le registre ; un titre vide est refusé", async () => {
    const ur = projets.get("UR")!;
    expect(await R.enregistrerRisque(await acces("sophonie.charles"), ur, null, { titre: "Hors équipe", description: "", probabilite: 2, impact: 2, responsableId: null, reponse: "", revueLe: null })).toHaveProperty("erreur");
    expect(await R.enregistrerRisque(await acces("myriam.valcin"), ur, null, { titre: " ", description: "", probabilite: 2, impact: 2, responsableId: null, reponse: "", revueLe: null })).toEqual({ erreur: "Décrivez le risque en quelques mots." });
    // Un membre ne retire pas le risque d'un autre : il le clôt.
    const [r] = (await R.risquesDuProjet(ur)).filter((x) => x.auteur === "Myriam Valcin");
    expect(await R.retirerRisque(await acces("ricardo.etienne"), ur, r.id)).toHaveProperty("erreur");
    const critiques = await R.risquesCritiquesOuverts([ur, projets.get("UC")!]);
    expect(critiques.get(ur)).toBe(1);
    expect(critiques.get(projets.get("UC")!)).toBeUndefined();
  });

  it("phases : la gestion les organise ; une phase dépassée met le projet à surveiller ; terminée, plus rien", async () => {
    const un = projets.get("UN")!;
    // La santé se calcule à l'ouverture du portefeuille : on la calcule ici pour Uninet.
    await (await import("@/lib/donnees/sante")).recalculerSante([un]);
    expect((await sante("UN")).motif).toMatch(/Phase « Intégration avec TMS » pas terminée/);
    const lp = await acces("ludovic.pierre");
    // Un membre de l'équipe qui ne gère pas le projet n'organise pas les phases.
    const phases = await R.phasesDuProjet(un);
    const tms = phases.find((x) => x.nom === "Intégration avec TMS")!;
    expect(await R.terminerPhase(await acces("sophonie.charles"), un, tms.id, true)).toHaveProperty("erreur");
    expect(await R.terminerPhase(lp, un, tms.id, true)).toEqual({ ok: true });
    expect((await sante("UN")).motif ?? "").not.toMatch(/Phase « Intégration avec TMS »/);
    // Rouvrir : le motif revient.
    expect(await R.terminerPhase(lp, un, tms.id, false)).toEqual({ ok: true });
    expect((await sante("UN")).motif).toMatch(/Phase « Intégration avec TMS » pas terminée/);
    // Ajouter, déplacer, retirer.
    expect(await R.ajouterPhase(lp, un, { nom: "pilote", debut: "2026-12-10", fin: "2026-12-01" })).toEqual({ erreur: "La fin d'une phase suit son début." });
    expect(await R.ajouterPhase(lp, un, { nom: "pilote au siège", debut: null, fin: null })).toEqual({ ok: true });
    let l = await R.phasesDuProjet(un);
    const pilote = l.at(-1)!;
    expect(pilote.nom).toBe("Pilote au siège");
    expect(await R.deplacerPhase(lp, un, pilote.id, -1)).toEqual({ ok: true });
    l = await R.phasesDuProjet(un);
    expect(l.at(-2)!.id).toBe(pilote.id);
    expect(await R.retirerPhase(lp, un, pilote.id)).toEqual({ ok: true });
    l = await R.phasesDuProjet(un);
    expect(l.map((x) => x.ordre)).toEqual(l.map((_, i) => i + 1));
  });

  it("phases types : réparties de l'entrée à la fin prévue, seulement s'il n'y en a pas", async () => {
    const pr = projets.get("PR")!; // Plateforme de recrutement : du 4 mai 2026 au 29 janvier 2027
    const dj = await acces("daphnee.joseph");
    expect(await R.utiliserPhasesTypes(dj, pr)).toEqual({ ok: true });
    const l = await R.phasesDuProjet(pr);
    expect(l.map((x) => x.nom)).toEqual(["Cadrage", "Conception", "Réalisation", "Validation métier", "Déploiement", "Clôture"]);
    expect(l[0].debut).toBe("2026-05-04");
    expect(l.at(-1)!.fin).toBe("2027-01-29");
    for (let i = 1; i < l.length; i++) expect(l[i].debut! >= l[i - 1].debut!).toBe(true);
    expect(await R.utiliserPhasesTypes(dj, pr)).toEqual({ erreur: "Ce projet a déjà ses phases." });
  });

  it("temps passé : noté par la personne ou qui modifie la tâche, pas dans le futur ni trop loin ; compté au projet", async () => {
    const t = await tache("UR", "Préparation de l'audit de sécurité");
    const avant = await T.tempsDeLaTache(t.id);
    expect(avant.minutes).toBe(18 * 60);
    const dj = await acces("daphnee.joseph");
    expect(await T.noterTemps(dj, t, { jour: "2026-10-29", minutes: 90, note: " Relecture   du rapport " })).toEqual({ ok: true });
    const apres = await T.tempsDeLaTache(t.id);
    expect(apres.minutes).toBe(18 * 60 + 90);
    expect(apres.entrees[0]).toMatchObject({ jour: "2026-10-29", minutes: 90, note: "Relecture du rapport", personne: "Daphnée Joseph", notePar: "Daphnée Joseph" });
    expect(await T.noterTemps(dj, t, { jour: "2026-11-02", minutes: 60, note: "" })).toEqual({ erreur: "Le temps se note une fois passé : pas de date future." });
    expect(await T.noterTemps(dj, t, { jour: "2026-07-01", minutes: 60, note: "" })).toEqual({ erreur: `On note le temps des ${T.JOURS_RETRO} derniers jours.` });
    expect(await T.noterTemps(dj, t, { jour: null, minutes: null, note: "" })).toHaveProperty("erreur");
    // Quelqu'un qui ne peut pas modifier la tâche ne note pas de temps dessus.
    expect(await T.noterTemps(await acces("sophonie.charles"), t, { jour: "2026-10-29", minutes: 30, note: "" })).toHaveProperty("erreur");
    // Compté au projet, et pour la personne de la tâche.
    const projet = await T.tempsDuProjet(projets.get("UR")!);
    expect(projet.minutes).toBeGreaterThanOrEqual(18 * 60 + 90);
    expect(projet.tachesAvecTemps).toBe(3);
    const parPersonne = await T.tempsDesPersonnes([qui("daphnee.joseph").id], "2026-10-01", "2026-10-31");
    expect(parPersonne.get(qui("daphnee.joseph").id)).toBe(18 * 60 + 90);
    // Retirer : son auteur.
    expect(await T.retirerTemps(dj, t, apres.entrees[0].id)).toEqual({ ok: true });
    expect((await T.tempsDeLaTache(t.id)).minutes).toBe(18 * 60);
  });
});
