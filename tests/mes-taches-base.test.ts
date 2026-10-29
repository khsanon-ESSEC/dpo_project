/**
 * Mes tâches en trois vues (29 octobre 2026), contre la base de démonstration : ce que le tableau et le calendrier
 * lisent (estimation, blocage, échéances du mois, faites comprises).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as SemaineModule from "@/lib/donnees/semaine";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("Mes tâches : tableau et calendrier", () => {
  let D: typeof DbModule;
  let S: typeof SemaineModule;
  let daphnee = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    S = await import("@/lib/donnees/semaine");
    [{ id: daphnee }] = await D.db.select({ id: D.schema.personnes.id }).from(D.schema.personnes).where(like(D.schema.personnes.courriel, "daphnee.joseph@%"));
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("le tableau lit l'estimation et ce qui bloque", async () => {
    const taches = await S.tachesDe([daphnee]);
    const bloquee = taches.find((t) => t.statut === "bloquee")!;
    expect(bloquee).toMatchObject({ titre: "Accès de test DTI", estimationHeures: 2, blocage: expect.stringMatching(/Identifiants de test demandés à la DTI/) });
    // Chaque tâche porte son estimation (ou null) et son début : le tableau et la charge s'en servent.
    expect(taches.every((t) => "estimationHeures" in t && "debut" in t)).toBe(true);
  });

  it("le calendrier lit les échéances du mois, faites comprises, dans l'ordre", async () => {
    const oct = await S.echeancesDe(daphnee, "2026-09-28", "2026-11-01");
    expect(oct.length).toBeGreaterThanOrEqual(10);
    expect(oct.every((t) => t.echeance! >= "2026-09-28" && t.echeance! <= "2026-11-01")).toBe(true);
    expect(oct.map((t) => t.echeance)).toEqual([...oct.map((t) => t.echeance)].sort());
    expect(oct.some((t) => t.statut === "faite")).toBe(true);
    expect(oct.find((t) => t.titre === "Cahier des charges, version 1")).toMatchObject({ echeance: "2026-10-30", projetCode: "PR" });
    // Rien hors de la fenêtre demandée.
    expect(await S.echeancesDe(daphnee, "2020-01-01", "2020-01-31")).toEqual([]);
  });
});
