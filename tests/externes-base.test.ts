/**
 * Personnes hors division et projets d'autres divisions, contre la base de démonstration.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as ExternesModule from "@/lib/donnees/externes";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as SemaineModule from "@/lib/donnees/semaine";
import type * as RapportModule from "@/lib/donnees/rapport";
import type * as ConseilModule from "@/lib/donnees/conseil";
import type * as ChargeModule from "@/lib/donnees/charge";
import type * as EquipeModule from "@/lib/donnees/equipe";
import type * as ReunionsModule from "@/lib/donnees/reunions";
import { peutGererProjet } from "@/lib/projets";
import { redigeUnRapport } from "@/lib/regles";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("personnes hors division et projets d'autres divisions", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let X: typeof ExternesModule;
  let G: typeof GestionModule;
  let S: typeof SemaineModule;
  let R: typeof RapportModule;
  let C: typeof ConseilModule;
  let CH: typeof ChargeModule;
  let EQ: typeof EquipeModule;
  let RE: typeof ReunionsModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (cle: string) => gens.get(cle)!;
  const acces = (cle: string) => A.acces(qui(cle));
  const base = { description: "", echeance: null, debut: null, estimationHeures: null };
  const nbExternes = async () => (await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.externe, true))).length;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    X = await import("@/lib/donnees/externes");
    G = await import("@/lib/donnees/gestion");
    S = await import("@/lib/donnees/semaine");
    R = await import("@/lib/donnees/rapport");
    C = await import("@/lib/donnees/conseil");
    CH = await import("@/lib/donnees/charge");
    EQ = await import("@/lib/donnees/equipe");
    RE = await import("@/lib/donnees/reunions");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      // Les personnes hors division sans courriel se retrouvent par « prenom.nom ».
      const cle = p.courriel ? p.courriel.split("@")[0] : `${p.prenom}.${p.nom}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      gens.set(cle, { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("une fiche hors division n'est créée qu'une fois pour la même personne", async () => {
    const pd = qui("patrick.dorsainvil").id;
    const ml = qui("marc-antoine.louis").id;
    expect(await X.trouverOuCreerExterne("patrick  DORSAINVIL", "dti", ml)).toBe(pd);
    expect(await X.trouverOuCreerExterne("Patrick Dorsainvil", "", ml)).toBe(pd);
    const avant = await nbExternes();
    const autre = await X.trouverOuCreerExterne("Patrick Dorsainvil", "Cabinet Kalinda", ml);
    expect(autre).not.toBe(pd);
    expect(await nbExternes()).toBe(avant + 1);
    expect(await X.trouverOuCreerExterne("   ", "DTI", ml)).toBeNull();
  });

  it("confier une tâche à quelqu'un hors division : hors projet ou sur un projet qu'on dirige", async () => {
    const mv = await acces("myriam.valcin");
    const r = await G.creerTacheGeree(mv, { ...base, titre: "Revue des journaux du pare-feu", projetId: projets.get("UR")!, assigneId: "", nouvelExterne: { nom: "Jonas Lafontant", organisation: "DTI" } });
    expect(r).toHaveProperty("id");
    const [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, (r as { id: string }).id));
    const jonas = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.id, t.assigneId));
    expect(jonas[0]).toMatchObject({ prenom: "Jonas", nom: "Lafontant", organisation: "DTI", externe: true, motDePasseHash: null });
    expect((await G.membresDuProjet(projets.get("UR")!)).some((m) => m.personneId === t.assigneId && m.externe)).toBe(true);
    // Daphnée ne dirige pas UR : pas de tâche pour une personne hors division sur ce projet, et pas de fiche créée pour rien.
    const avant = await nbExternes();
    const dj = await acces("daphnee.joseph");
    expect(await G.creerTacheGeree(dj, { ...base, titre: "Essai", projetId: projets.get("UR")!, assigneId: "", nouvelExterne: { nom: "Quelqu'un Dehors", organisation: "" } })).toHaveProperty("erreur");
    expect(await nbExternes()).toBe(avant);
    // Hors projet, oui : elle la suit, la voit et la retrouve dans « À faire ».
    const h = (await G.creerTacheGeree(dj, { ...base, titre: "Badge d'accès pour la consultante", projetId: null, assigneId: qui("nathalie.celestin").id })) as { id: string };
    const [th] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, h.id));
    expect(A.peutVoirTache(dj, th)).toBe(true);
    expect(A.peutVoirTache(await acces("ludovic.pierre"), th)).toBe(false);
    expect((await S.confieesHorsDivision(dj.moi.id)).map((x) => x.titre)).toEqual(expect.arrayContaining(["Badge d'accès pour la consultante", "Accès VPN pour le prestataire de la plateforme"]));
  });

  it("se confier une tâche sur un projet qu'on ne voit pas est refusé et n'ouvre pas le projet", async () => {
    const dj = await acces("daphnee.joseph");
    const cr = projets.get("CR")!;
    const visibles = await A.idsProjetsVisibles(dj);
    expect(visibles !== "tous" && visibles.has(cr)).toBe(false); // Daphnée ne voit pas CR au départ
    const membreAvant = (await G.membresDuProjet(cr)).some((m) => m.personneId === dj.moi.id);
    const r = await G.creerTacheGeree(dj, { ...base, titre: "M'inviter sur un projet caché", projetId: cr, assigneId: dj.moi.id });
    expect(r).toHaveProperty("erreur");
    // Elle n'est pas entrée dans l'équipe du projet, et CR reste invisible.
    expect((await G.membresDuProjet(cr)).some((m) => m.personneId === dj.moi.id)).toBe(membreAvant);
    const apres = await A.idsProjetsVisibles(dj);
    expect(apres !== "tous" && apres.has(cr)).toBe(false);
    // Sur un projet où elle travaille déjà, elle peut toujours se confier une tâche.
    const ur = projets.get("UR")!;
    expect(await G.creerTacheGeree(dj, { ...base, titre: "Ma tâche sur un projet où je suis", projetId: ur, assigneId: dj.moi.id })).toHaveProperty("id");
  });

  it("projet d'une autre division : le référent DPO le gère et lit les lignes ; le rapport mensuel l'ignore", async () => {
    const oc = projets.get("OC")!;
    const wb = await acces("wesner.bazile");
    expect(wb.projetsDiriges.has(oc)).toBe(true);
    const [p] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, oc));
    expect(p.division).toBe("Division Réseau et succursales");
    expect(peutGererProjet({ moiId: wb.moi.id, directeur: false, toutVoir: false, suivis: wb.suivis }, p)).toBe(true);
    expect(peutGererProjet({ moiId: qui("sophonie.charles").id, directeur: false, toutVoir: false, suivis: new Set([qui("sophonie.charles").id]) }, p)).toBe(false);
    // Le référent confie une tâche à un membre de l'équipe du projet, même s'il ne le suit pas.
    expect(await G.creerTacheGeree(wb, { ...base, titre: "Relire les maquettes", projetId: oc, assigneId: qui("joel.dorval").id })).toHaveProperty("id");
    // Dans le rapport de Sophonie, les lignes du projet OC vont au référent, pas à la cheffe du Réseau.
    const r = await R.obtenirOuCreerRapport(qui("sophonie.charles").id);
    const lignes = await R.lignesDuRapport(r.id);
    const surOC = lignes.filter((l) => l.projetCode === "OC");
    expect(surOC.length).toBeGreaterThan(0);
    expect(surOC.every((l) => l.projetChefId === wb.moi.id)).toBe(true);
    // Stratégique, mais d'une autre division : absent du rapport mensuel ; on peut le choisir pour un rapport ponctuel.
    const mensuel = await C.obtenirOuCreerRapportConseil();
    const codes = (await C.lignesConseil(mensuel.id, mensuel.statut)).map((l) => l.projet.code);
    expect(codes).not.toContain("OC");
    expect((await C.projetsPourRapport("tous")).find((x) => x.code === "OC")?.division).toBe("Division Réseau et succursales");
    // Un chef hors division sans référent : refusé.
    const pr = (await G.proposerProjet({ titre: "Carte prépayée Réseau", description: "", justification: "Demande du Réseau.", programme: "", strategique: false, finSouhaitee: "", chefSuggereId: "", code: "", division: "Division Réseau et succursales" }, qui("wesner.bazile").id)) as { id: string };
    expect(await G.deciderDemande(pr.id, { accepte: true, motif: "", chefProjetId: qui("mireille.saint-fort").id }, qui("nadege.augustin").id)).toHaveProperty("erreur");
    expect(await G.deciderDemande(pr.id, { accepte: true, motif: "", chefProjetId: qui("mireille.saint-fort").id, referentId: wb.moi.id }, qui("nadege.augustin").id)).toEqual({ ok: true });
  });

  it("la charge, l'équipe et le rapport ne concernent que la division", async () => {
    const { lignes } = await CH.chargeDesPersonnes([qui("patrick.dorsainvil").id, qui("daphnee.joseph").id]);
    expect(lignes.map((l) => l.id)).toEqual([qui("daphnee.joseph").id]);
    const { membres } = await CH.chargeDuProjet(projets.get("UR")!, qui("myriam.valcin").id);
    expect(membres.some((m) => m.id === qui("nathalie.celestin").id)).toBe(false);
    const e = await EQ.monEquipe(await acces("frantz.desrosiers"));
    expect(e.personnes.some((p) => p.id === qui("nathalie.celestin").id)).toBe(false);
    expect(redigeUnRapport(qui("nathalie.celestin"))).toBe(false);
  });

  it("avec un accès limité, une consultante voit ses tâches et ses projets, rien d'autre", async () => {
    const nc = await acces("nathalie.celestin");
    expect(nc.suivis).toEqual(new Set([nc.moi.id]));
    const visibles = await A.idsProjetsVisibles(nc);
    expect(visibles !== "tous" && visibles.has(projets.get("UR")!)).toBe(true);
    expect(visibles !== "tous" && visibles.has(projets.get("CR")!)).toBe(false);
  });

  it("une réunion avec une personne hors division compte pour la division seulement, sans alerte pour qui n'a pas d'accès", async () => {
    const lp = await acces("ludovic.pierre");
    const pd = qui("patrick.dorsainvil").id;
    const r = await RE.noterReunion(lp, { titre: "Point serveur de recette", jour: "2026-10-30", heure: "", dureeMinutes: 30, projetId: "", notes: "", participants: [pd] }, "tous");
    expect(r).toHaveProperty("id");
    const liste = await RE.reunionsDe(lp.moi.id, "2026-10-26", "2026-11-01");
    expect(liste.find((x) => x.titre === "Point serveur de recette")?.participants.map((p) => p.nom)).toContain("Patrick Dorsainvil");
    const alertes = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, pd), eq(D.schema.notifications.type, "reunion")));
    expect(alertes).toHaveLength(0);
  });

  it("fusionner deux fiches de la même personne", async () => {
    const ml = qui("marc-antoine.louis").id;
    const doublon = (await X.trouverOuCreerExterne("Mireille St-Fort", "Réseau", ml))!;
    const t = (await G.creerTacheGeree(await acces("nadege.augustin"), { ...base, titre: "Valider la liste des succursales pilotes", projetId: projets.get("OC")!, assigneId: doublon })) as { id: string };
    await X.fusionnerExternes(ml, doublon, qui("mireille.saint-fort").id);
    const [tache] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, t.id));
    expect(tache.assigneId).toBe(qui("mireille.saint-fort").id);
    expect(await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.id, doublon))).toHaveLength(0);
    await expect(X.fusionnerExternes(ml, qui("mireille.saint-fort").id, qui("daphnee.joseph").id)).rejects.toThrow();
  });
});
