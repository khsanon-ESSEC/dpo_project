/**
 * Livrables, contre la base de démonstration : un responsable par livrable, qui en détermine les tâches et
 * peut en confier à l'équipe du projet ; prêt à valider, validé ou renvoyé par qui gère le projet.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as LivrablesModule from "@/lib/donnees/livrables";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("livrables", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let L: typeof LivrablesModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const livrable = async (code: string, libelle: string) =>
    (await D.db.select().from(D.schema.indicateurs).where(and(eq(D.schema.indicateurs.projetId, projets.get(code)!), eq(D.schema.indicateurs.libelle, libelle))))[0];
  const alertes = async (courriel: string) => D.db.select().from(D.schema.notifications).where(eq(D.schema.notifications.personneId, qui(courriel).id));
  const base = { description: "", echeance: null, debut: null, estimationHeures: null };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    L = await import("@/lib/donnees/livrables");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("avancement d'un livrable : ses tâches, celles prévues après sa date, les tâches hors livrable", async () => {
    const { livrables, horsLivrable } = await L.livrablesDuProjet(projets.get("CR")!);
    const v = livrables.find((l) => l.libelle === "Validation métier réalisée")!;
    expect(v.responsable).toBe("Wesner Bazile");
    expect(v.compte).toMatchObject({ total: 4, faites: 1, bloquees: 1, apres: 1 });
    expect(v.taches.find((t) => t.apres)?.titre).toBe("Validation métier de Credos");
    expect(v.affiche).toBe("en_cours");
    expect(horsLivrable.total).toBeGreaterThanOrEqual(0);
    const ur = await L.livrablesDuProjet(projets.get("UR")!);
    expect(ur.livrables.find((l) => l.libelle === "Audit de sécurité effectué et passé")?.enRetard).toBe(true);
  });

  it("« Mes livrables » : ceux dont on est responsable, pas encore validés", async () => {
    const miens = await L.mesLivrables(qui("daphnee.joseph").id);
    expect(miens.map((l) => `${l.code} · ${l.libelle}`)).toEqual(expect.arrayContaining(["UR · Audit de sécurité effectué et passé", "PR · Cahier des charges validé"]));
    expect(miens.some((l) => l.etat === "atteint")).toBe(false);
  });

  it("le responsable confie une tâche de son livrable à un membre de l'équipe, pas une tâche hors livrable", async () => {
    const dj = await acces("daphnee.joseph");
    const audit = await livrable("UR", "Audit de sécurité effectué et passé");
    const ricardo = qui("ricardo.etienne").id;
    // Sans le livrable : Daphnée ne suit pas Ricardo et ne dirige pas UR.
    expect(await G.creerTacheGeree(dj, { ...base, titre: "Relire le rapport d'audit", projetId: projets.get("UR")!, assigneId: ricardo })).toHaveProperty("erreur");
    const r = await G.creerTacheGeree(dj, { ...base, titre: "Relire le rapport d'audit", projetId: projets.get("UR")!, assigneId: ricardo, livrableId: audit.id });
    expect(r).toHaveProperty("id");
    const [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, (r as { id: string }).id));
    expect(t.livrableId).toBe(audit.id);
    expect(t.assigneId).toBe(ricardo);
    // Pas au-delà de l'équipe du projet : Thierry Lamy n'est pas dans l'équipe d'UR.
    expect(await G.creerTacheGeree(dj, { ...base, titre: "Hors équipe", projetId: projets.get("UR")!, assigneId: qui("thierry.lamy").id, livrableId: audit.id })).toHaveProperty("erreur");
    // Un livrable d'un autre projet est refusé.
    const cdc = await livrable("PR", "Cahier des charges validé");
    expect(await G.creerTacheGeree(dj, { ...base, titre: "Mauvais projet", projetId: projets.get("UR")!, assigneId: dj.moi.id, livrableId: cdc.id })).toEqual({ erreur: "Ce livrable n'est pas un livrable du projet choisi." });
  });

  it("changer de projet retire la tâche de son livrable ; on peut la rattacher à un autre livrable", async () => {
    const mv = await acces("myriam.valcin");
    const mel = await livrable("UR", "Application mise en ligne");
    const c = (await G.creerTacheGeree(mv, { ...base, titre: "Bascule DNS", projetId: projets.get("UR")!, assigneId: mv.moi.id, livrableId: mel.id })) as { id: string };
    const [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, c.id));
    expect(await G.modifierDefinitionTache(mv, t, { titre: t.titre, description: "", projetId: null, assigneId: mv.moi.id })).toEqual({ ok: true });
    const [apres] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, c.id));
    expect(apres.livrableId).toBeNull();
    const ev = await D.db.select().from(D.schema.evenementsTache).where(and(eq(D.schema.evenementsTache.tacheId, c.id), eq(D.schema.evenementsTache.type, "livrable")));
    expect(ev).toHaveLength(1);
  });

  it("prêt à valider, renvoyé avec une remarque, puis validé ; chacun est prévenu ; les autres ne le peuvent pas", async () => {
    const mel = await livrable("UR", "Application mise en ligne");
    const re = await acces("ricardo.etienne");
    const mv = await acces("myriam.valcin");
    const dj = await acces("daphnee.joseph");
    expect(await L.agirSurLivrable(dj, mel.id, "pret")).toHaveProperty("erreur"); // pas sa responsabilité
    expect(await L.agirSurLivrable(re, mel.id, "valider")).toHaveProperty("erreur"); // le responsable ne valide pas
    const avantMv = (await alertes("myriam.valcin")).length;
    expect(await L.agirSurLivrable(re, mel.id, "pret")).toMatchObject({ ok: true });
    expect((await alertes("myriam.valcin")).length).toBe(avantMv + 1);
    expect(await L.agirSurLivrable(mv, mel.id, "renvoyer", "  ")).toEqual({ erreur: "Dites en une phrase ce qui reste à reprendre." });
    expect(await L.agirSurLivrable(mv, mel.id, "renvoyer", "Les tests de charge manquent")).toMatchObject({ ok: true });
    let l = await livrable("UR", "Application mise en ligne");
    expect(l.etat).toBe("en_cours");
    expect(l.remarque).toBe("Les tests de charge manquent");
    expect((await alertes("ricardo.etienne")).some((n) => n.texte.includes("à reprendre : Les tests de charge manquent"))).toBe(true);
    expect(await L.agirSurLivrable(re, mel.id, "pret")).toMatchObject({ ok: true });
    expect(await L.agirSurLivrable(mv, mel.id, "valider")).toMatchObject({ ok: true });
    l = await livrable("UR", "Application mise en ligne");
    expect(l.etat).toBe("atteint");
    expect(l.valideParId).toBe(mv.moi.id);
    expect(l.remarque).toBe("");
    // Rouvrir remet le livrable en cours (et l'état de la base de démonstration comme avant).
    expect(await L.agirSurLivrable(mv, mel.id, "rouvrir")).toMatchObject({ ok: true });
    await D.db.update(D.schema.indicateurs).set({ etat: "a_venir" }).where(eq(D.schema.indicateurs.id, mel.id));
  });

  it("nommer un responsable le fait entrer dans l'équipe du projet et le prévient", async () => {
    const mv = qui("myriam.valcin").id;
    const plan = await livrable("UR", "Plan de communication approuvé");
    const thierry = qui("thierry.lamy").id;
    expect(await G.modifierLivrable(projets.get("UR")!, plan.id, { libelle: plan.libelle, prevuLe: "2026-12-01", responsableId: thierry, critere: "Signé par le marketing" }, mv)).toEqual({ ok: true });
    const membres = await G.membresDuProjet(projets.get("UR")!);
    expect(membres.some((m) => m.personneId === thierry)).toBe(true);
    expect((await alertes("thierry.lamy")).some((n) => n.texte.includes("Vous êtes responsable du livrable « Plan de communication approuvé »"))).toBe(true);
    const apres = await livrable("UR", "Plan de communication approuvé");
    expect(apres).toMatchObject({ prevuLe: "2026-12-01", critere: "Signé par le marketing", responsableId: thierry });
    expect(await G.ajouterLivrable(projets.get("UR")!, { libelle: "  ", prevuLe: null, responsableId: null, critere: "" }, mv)).toEqual({ erreur: "Donnez un nom au livrable." });
  });
});
