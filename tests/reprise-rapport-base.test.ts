/**
 * « Reprendre mon rapport » (29 octobre 2026) : tant que son destinataire ne l'a pas ouvert, l'auteur reprend son
 * rapport envoyé ; il redevient un brouillon. Sur une semaine à part (celle du 2 novembre), pour ne pas gêner les autres
 * fichiers de tests qui lisent les rapports de la semaine de démonstration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as RapportModule from "@/lib/donnees/rapport";

const URL_TEST = process.env.TEST_DATABASE_URL;
const W = "2026-11-02";

describe.skipIf(!URL_TEST)("reprendre un rapport envoyé tant qu'il n'est pas lu", () => {
  let D: typeof DbModule;
  let R: typeof RapportModule;
  const p: Record<string, string> = {};
  const id: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    process.env.DATE_DEMO = "2026-10-30";
    D = await import("@/db");
    R = await import("@/lib/donnees/rapport");
    for (const x of await D.db.select().from(D.schema.personnes)) if (x.courriel) p[x.courriel.split("@")[0]] = x.id;
    const S = D.schema;
    // Guerline (sans chef d'équipe) envoie à Nadège ; Nadège a un brouillon qui en reprend deux lignes.
    const [rg] = await D.db.insert(S.rapportsHebdo).values({ auteurId: p["guerline.paul"], semaine: W, statut: "envoye", destinataireId: p["nadege.augustin"], envoyeLe: new Date() }).returning();
    id.g = rg.id;
    const [l1] = await D.db.insert(S.lignesRapport).values({ rapportId: rg.id, champId: "fait", partie: "fait", texte: "Procédure, version 2", ordre: 1 }).returning();
    const [l2] = await D.db.insert(S.lignesRapport).values({ rapportId: rg.id, champId: "bloque", partie: "bloque", texte: "Conformité : toujours rien", ordre: 2 }).returning();
    await D.db.insert(S.notifications).values({ personneId: p["nadege.augustin"], type: "rapport_recu", texte: "Rapport de la semaine de Guerline Paul", lien: `/rapports/${rg.id}` });
    const [rn] = await D.db.insert(S.rapportsHebdo).values({ auteurId: p["nadege.augustin"], semaine: W, statut: "brouillon" }).returning();
    id.n = rn.id;
    const ligne = async (cle: string, origines: string[]) => {
      const [l] = await D.db.insert(S.lignesRapport).values({ rapportId: rn.id, champId: "fait_equipe", partie: "fait", texte: cle, ordre: 1, origines }).returning();
      id[cle] = l.id;
    };
    await ligne("seule", [`l:${l1.id}`]);
    await ligne("partagee", [`l:${l2.id}`, "l:00000000-0000-0000-0000-000000000000"]);
    await ligne("sienne", []);
  });

  afterAll(async () => {
    await D.db.delete(D.schema.notifications).where(eq(D.schema.notifications.lien, `/rapports/${id.g}`));
    await D.db.delete(D.schema.rapportsHebdo).where(inArray(D.schema.rapportsHebdo.id, [id.g, id.n]));
    await globalThis.__pgClient?.end();
  });

  const relire = async (x: string) => (await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, x)))[0];

  it("possible pour l'auteur seulement, sur la semaine en cours, tant que rien ne l'a figé", async () => {
    const r = await relire(id.g);
    expect(await R.repriseDuRapport(r, p["guerline.paul"], W)).toEqual({ possible: true });
    expect(await R.repriseDuRapport(r, p["nadege.augustin"], W)).toBeNull();
    expect(await R.repriseDuRapport(r, p["guerline.paul"], "2026-10-26")).toBeNull();
    expect(await R.repriseDuRapport({ ...r, luLe: new Date(), luPar: p["nadege.augustin"] }, p["guerline.paul"], W)).toEqual({ possible: false, raison: "lu", qui: "Nadège Augustin" });
    // Un mot de Nadège sous le rapport : figé.
    const [m] = await D.db.insert(D.schema.messagesRapport).values({ rapportId: r.id, auteurId: p["nadege.augustin"], texte: "Merci." }).returning();
    expect(await R.repriseDuRapport(r, p["guerline.paul"], W)).toMatchObject({ possible: false, raison: "echange" });
    await D.db.delete(D.schema.messagesRapport).where(eq(D.schema.messagesRapport.id, m.id));
    // Un mot de Guerline elle-même ne fige rien.
    const [m2] = await D.db.insert(D.schema.messagesRapport).values({ rapportId: r.id, auteurId: p["guerline.paul"], texte: "Précision." }).returning();
    expect(await R.repriseDuRapport(r, p["guerline.paul"], W)).toEqual({ possible: true });
    await D.db.delete(D.schema.messagesRapport).where(eq(D.schema.messagesRapport.id, m2.id));
    // Nadège a envoyé son propre rapport de la semaine : figé.
    await D.db.update(D.schema.rapportsHebdo).set({ statut: "envoye" }).where(eq(D.schema.rapportsHebdo.id, id.n));
    expect(await R.repriseDuRapport(r, p["guerline.paul"], W)).toEqual({ possible: false, raison: "repris_plus_haut", qui: "Nadège Augustin" });
    expect(await R.reprendreRapport(r.id, p["guerline.paul"], W)).toEqual({ erreur: expect.stringMatching(/^Nadège Augustin a déjà envoyé son rapport/) });
    await D.db.update(D.schema.rapportsHebdo).set({ statut: "brouillon" }).where(eq(D.schema.rapportsHebdo.id, id.n));
  });

  it("reprendre : brouillon, alerte retirée, lignes reprises retirées du brouillon de Nadège", async () => {
    expect(await R.reprendreRapport(id.g, p["guerline.paul"], W)).toEqual({ ok: true });
    expect(await relire(id.g)).toMatchObject({ statut: "brouillon", envoyeLe: null });
    expect(await D.db.select().from(D.schema.notifications).where(eq(D.schema.notifications.lien, `/rapports/${id.g}`))).toEqual([]);
    const lignes = await D.db.select().from(D.schema.lignesRapport).where(eq(D.schema.lignesRapport.rapportId, id.n));
    expect(lignes.map((l) => l.texte).sort()).toEqual(["partagee", "sienne"]);
    expect(lignes.find((l) => l.texte === "partagee")!.origines).toEqual(["l:00000000-0000-0000-0000-000000000000"]);
    // Ses propres lignes restent.
    expect(await D.db.select().from(D.schema.lignesRapport).where(and(eq(D.schema.lignesRapport.rapportId, id.g)))).toHaveLength(2);
    // Une seconde fois : ce n'est plus un rapport envoyé.
    expect(await R.reprendreRapport(id.g, p["guerline.paul"], W)).toHaveProperty("erreur");
  });

  it("une fois ouvert par le destinataire, il ne se reprend plus", async () => {
    await D.db.update(D.schema.rapportsHebdo).set({ statut: "envoye", envoyeLe: new Date(), luLe: new Date(), luPar: p["nadege.augustin"] }).where(eq(D.schema.rapportsHebdo.id, id.g));
    expect(await R.reprendreRapport(id.g, p["guerline.paul"], W)).toEqual({ erreur: expect.stringMatching(/^Nadège Augustin l'a déjà ouvert/) });
    expect((await relire(id.g)).statut).toBe("envoye");
  });
});
