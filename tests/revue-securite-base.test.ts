/**
 * Revue de sécurité du 29 octobre 2026 (documents et droits), contre la base de démonstration.
 * Chaque test remet la base comme il l'a trouvée.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as DocumentsModule from "@/lib/donnees/documents";
import type * as RecurrenceModule from "@/lib/donnees/recurrence";
import type * as RisquesModule from "@/lib/donnees/risques";
import type * as DecisionsModule from "@/lib/donnees/decisions";
import type { Utilisateur } from "@/lib/auth/session";
import { peutDeciderDemande } from "@/lib/projets";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("revue de sécurité du 29 octobre 2026", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let DOC: typeof DocumentsModule;
  let R: typeof RecurrenceModule;
  let RI: typeof RisquesModule;
  let DE: typeof DecisionsModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const tache = async (code: string, titre: string) => (await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.projetId, projets.get(code)!), eq(D.schema.taches.titre, titre))))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    DOC = await import("@/lib/donnees/documents");
    R = await import("@/lib/donnees/recurrence");
    RI = await import("@/lib/donnees/risques");
    DE = await import("@/lib/donnees/decisions");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("tâche récurrente : s'arrête quand la personne quitte l'équipe ; annuler l'arrête, rétablir la reprend", async () => {
    const ur = projets.get("UR")!;
    const mv = await acces("myriam.valcin"); // cheffe du projet UR
    const rd = qui("ricardo.etienne"); // membre de l'équipe UR
    const n = await G.creerTacheGeree(mv, { titre: "Point hebdomadaire de test", description: "", projetId: ur, assigneId: rd.id, echeance: "2026-11-03", debut: null, estimationHeures: null });
    expect(n).toHaveProperty("id");
    const t = (await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, (n as { id: string }).id)))[0];
    const r = await R.repeterTache(mv, t, "semaine:2");
    expect(r).toHaveProperty("id");
    const id = (r as { id: string }).id;
    const regle = async () => (await D.db.select().from(D.schema.tachesRecurrentes).where(eq(D.schema.tachesRecurrentes.id, id)))[0];
    const relire = async () => (await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, t.id)))[0];
    // Annuler la tâche arrête la répétition ; la rétablir la reprend.
    expect(await G.annulerTache(mv, await relire(), "Plus utile")).toEqual({ ok: true });
    expect((await regle()).arreteeLe).not.toBeNull();
    await G.retablirTache(mv, await relire());
    expect((await regle()).arreteeLe).toBeNull();
    // Encore dans l'équipe : l'occurrence est créée.
    expect(await R.genererOccurrences("2026-11-04", id)).toBe(1);
    // Il quitte l'équipe : plus d'occurrence, la règle s'arrête.
    const [m] = await D.db.select().from(D.schema.membresProjet).where(and(eq(D.schema.membresProjet.projetId, ur), eq(D.schema.membresProjet.personneId, rd.id)));
    expect(m).toBeDefined();
    await D.db.delete(D.schema.membresProjet).where(eq(D.schema.membresProjet.id, m.id));
    expect(await R.genererOccurrences("2026-11-11", id)).toBe(0);
    expect((await regle()).arreteeLe).not.toBeNull();
    // Remise en état.
    await D.db.insert(D.schema.membresProjet).values(m);
    const creees = await D.db.select({ id: D.schema.taches.id }).from(D.schema.taches).where(eq(D.schema.taches.recurrenceId, id));
    for (const x of creees) {
      await D.db.delete(D.schema.evenementsTache).where(eq(D.schema.evenementsTache.tacheId, x.id));
      await D.db.delete(D.schema.notifications).where(eq(D.schema.notifications.lien, `/taches/${x.id}`));
      await D.db.delete(D.schema.taches).where(eq(D.schema.taches.id, x.id));
    }
    await D.db.delete(D.schema.tachesRecurrentes).where(eq(D.schema.tachesRecurrentes.id, id));
  });

  it("demande de projet : décidée par un exécutif, ou par un directeur de la direction du demandeur", () => {
    const moi = "m";
    expect(peutDeciderDemande({ toutVoir: true, directeur: false, suivis: new Set([moi]) }, { demandeParId: "x" })).toBe(true);
    expect(peutDeciderDemande({ toutVoir: false, directeur: true, suivis: new Set([moi, "x"]) }, { demandeParId: "x" })).toBe(true);
    // Un directeur d'une autre direction, même s'il voit la demande (sponsor, chef suggéré) : non.
    expect(peutDeciderDemande({ toutVoir: false, directeur: true, suivis: new Set([moi]) }, { demandeParId: "x" })).toBe(false);
    expect(peutDeciderDemande({ toutVoir: false, directeur: false, suivis: new Set([moi, "x"]) }, { demandeParId: "x" })).toBe(false);
  });

  it("documents : une personne hors division les lit si elle est dans l'équipe, plus après en être sortie", async () => {
    const ur = projets.get("UR")!;
    const [doc] = await D.db
      .insert(D.schema.documentsProjet)
      .values({ projetId: ur, nom: "test.pdf", type: "application/pdf", taille: 5, contenu: Buffer.from("%PDF-"), empreinte: "test", categorie: "autre", deposeParId: qui("myriam.valcin").id })
      .returning({ id: D.schema.documentsProjet.id });
    const nc = qui("nathalie.celestin");
    expect(await DOC.lireDocument(await A.acces(nc), doc.id)).not.toBeNull();
    const [m] = await D.db.select().from(D.schema.membresProjet).where(and(eq(D.schema.membresProjet.projetId, ur), eq(D.schema.membresProjet.personneId, nc.id)));
    await D.db.delete(D.schema.membresProjet).where(eq(D.schema.membresProjet.id, m.id));
    // Elle voit encore le projet (sa tâche), mais plus ses documents.
    const a = await A.acces(nc);
    const vus = await A.idsProjetsVisibles(a);
    expect(vus !== "tous" && vus.has(ur)).toBe(true);
    expect(await DOC.lireDocument(a, doc.id)).toBeNull();
    await D.db.insert(D.schema.membresProjet).values(m);
    // Une personne de la division qui voit le projet les lit.
    expect(await DOC.lireDocument(await acces("myriam.valcin"), doc.id)).not.toBeNull();
    await D.db.delete(D.schema.documentsProjet).where(eq(D.schema.documentsProjet.id, doc.id));
  });

  it("un projet qui a une décision au registre ne se supprime pas", async () => {
    const td = projets.get("TD")!; // demande, sans tâche
    const avant = await G.activiteDuProjet(td);
    expect(avant.decisions).toBe(0);
    const [d] = await D.db.insert(D.schema.decisionsProjet).values({ projetId: td, texte: "Décision de test", decideeLe: "2026-10-28" }).returning();
    const apres = await G.activiteDuProjet(td);
    expect(apres.decisions).toBe(1);
    expect((await import("@/lib/projets")).projetSupprimable(apres)).toBe(false);
    await D.db.delete(D.schema.decisionsProjet).where(eq(D.schema.decisionsProjet.id, d.id));
  });

  it("risques : le responsable vient de l'équipe ; un projet archivé a son registre figé", async () => {
    const ur = projets.get("UR")!;
    const mv = await acces("myriam.valcin");
    const base = { titre: "Risque de test", description: "", probabilite: 1, impact: 1, reponse: "", revueLe: null };
    // Quelqu'un hors de l'équipe (Sophonie) ne peut pas être nommé responsable.
    expect(await RI.enregistrerRisque(mv, ur, null, { ...base, responsableId: qui("sophonie.charles").id })).toEqual({ erreur: "Le responsable d'un risque fait partie de l'équipe du projet : ajoutez-le d'abord à l'équipe." });
    const n = await RI.enregistrerRisque(mv, ur, null, { ...base, responsableId: qui("daphnee.joseph").id });
    expect(n).toHaveProperty("id");
    const id = (n as { id: string }).id;
    // Archivé : ni statut, ni retrait, ni phase, ni correction de décision.
    await D.db.update(D.schema.projets).set({ archiveLe: new Date() }).where(eq(D.schema.projets.id, ur));
    expect(await RI.changerStatutRisque(mv, ur, id, "clos")).toHaveProperty("erreur");
    expect(await RI.retirerRisque(mv, ur, id)).toHaveProperty("erreur");
    expect(await RI.ajouterPhase(mv, ur, { nom: "Pendant l'archive", debut: null, fin: null })).toHaveProperty("erreur");
    const [dec] = await D.db.select().from(D.schema.decisionsProjet).where(eq(D.schema.decisionsProjet.projetId, ur));
    if (dec) expect(await DE.retirerDecision(await acces("ludovic.pierre"), ur, dec.id)).toHaveProperty("erreur");
    await D.db.update(D.schema.projets).set({ archiveLe: null }).where(eq(D.schema.projets.id, ur));
    expect(await RI.retirerRisque(mv, ur, id)).toEqual({ ok: true });
  });

  it("une tâche qui change de projet perd ses dépendances", async () => {
    const ur = projets.get("UR")!;
    const mv = await acces("myriam.valcin");
    const [x, y] = await D.db
      .insert(D.schema.taches)
      .values([
        { titre: "Test dépendance A", projetId: ur, assigneId: qui("myriam.valcin").id, creeParId: qui("myriam.valcin").id },
        { titre: "Test dépendance B", projetId: ur, assigneId: qui("myriam.valcin").id, creeParId: qui("myriam.valcin").id },
      ])
      .returning();
    await D.db.insert(D.schema.dependancesTache).values({ tacheId: y.id, precedenteId: x.id });
    expect(await G.modifierDefinitionTache(mv, y, { titre: y.titre, description: "", projetId: null, assigneId: y.assigneId })).toEqual({ ok: true });
    expect(await D.db.select().from(D.schema.dependancesTache).where(eq(D.schema.dependancesTache.tacheId, y.id))).toHaveLength(0);
    await D.db.delete(D.schema.evenementsTache).where(eq(D.schema.evenementsTache.tacheId, y.id));
    await D.db.delete(D.schema.taches).where(eq(D.schema.taches.id, y.id));
    await D.db.delete(D.schema.taches).where(eq(D.schema.taches.id, x.id));
  });
});
