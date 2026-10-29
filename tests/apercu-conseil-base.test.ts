/**
 * Le rapport au conseil tel qu'il part (29 octobre 2026) : à l'approbation, la santé, les livrables et le risque
 * critique de chaque projet sont figés avec le rapport. Sur décembre 2026, pour ne pas gêner les autres fichiers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as ConseilModule from "@/lib/donnees/conseil";
import type * as ApercuModule from "@/lib/donnees/presentation-conseil";

const URL_TEST = process.env.TEST_DATABASE_URL;
const DEC = "2026-12-01";

describe.skipIf(!URL_TEST)("rapport au conseil : l'aperçu figé à l'approbation", () => {
  let D: typeof DbModule;
  let C: typeof ConseilModule;
  let AP: typeof ApercuModule;
  let frantz = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    C = await import("@/lib/donnees/conseil");
    AP = await import("@/lib/donnees/presentation-conseil");
    [{ id: frantz }] = await D.db.select({ id: D.schema.personnes.id }).from(D.schema.personnes).where(like(D.schema.personnes.courriel, "frantz.desrosiers@%"));
  });

  afterAll(async () => {
    await D.db.delete(D.schema.historiqueProjet).where(eq(D.schema.historiqueProjet.mois, DEC));
    await D.db.delete(D.schema.rapportsConseil).where(eq(D.schema.rapportsConseil.mois, DEC));
    await globalThis.__pgClient?.end();
  });

  it("l'aperçu du jour : santé, livrables, risque critique", async () => {
    const [ur] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "UR"));
    const a = (await AP.apercusDuJour([ur.id], "2026-10-30")).get(ur.id)!;
    expect(a).toMatchObject({ sante: ur.sante, risqueCritique: "Les correctifs de l'audit ne sont pas prêts pour la deuxième vague", le: "2026-10-30" });
    expect(a.livrables?.total).toBeGreaterThan(0);
    expect(a.livrables?.prochain).toMatchObject({ enRetard: expect.any(Boolean) });
  });

  it("approuver fige l'aperçu dans chaque ligne", async () => {
    const r = await C.obtenirOuCreerRapportConseil(DEC);
    const avant = await D.db.select().from(D.schema.lignesConseil).where(eq(D.schema.lignesConseil.rapportId, r.id));
    expect(avant.length).toBeGreaterThan(0);
    expect(avant.every((l) => l.apercu === null)).toBe(true);
    await C.approuverRapportConseil(r.id, frantz);
    const apres = await D.db.select().from(D.schema.lignesConseil).where(eq(D.schema.lignesConseil.rapportId, r.id));
    expect(apres.every((l) => l.apercu && typeof l.apercu.sante === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.apercu.le))).toBe(true);
  });
});
