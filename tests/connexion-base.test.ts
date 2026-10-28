/**
 * Limite d'essais du mot de passe de l'application, contre la base de démonstration : un essai est réservé
 * avant la vérification, en une seule écriture, si bien que des essais lancés en même temps comptent chacun.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as SessionModule from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;
const BON = "Demo-DPO-2026"; // mot de passe de la base de démonstration (scripts/semer.mjs)

describe.skipIf(!URL_TEST)("limite d'essais du mot de passe (base de démonstration)", () => {
  let D: typeof DbModule;
  let S: typeof SessionModule;
  let id: string;
  const etat = async () => (await D.db.select({ echecs: D.schema.personnes.echecsConnexion, bloque: D.schema.personnes.bloqueJusqua }).from(D.schema.personnes).where(eq(D.schema.personnes.id, id)))[0];
  const remettre = () => D.db.update(D.schema.personnes).set({ echecsConnexion: 0, bloqueJusqua: null }).where(eq(D.schema.personnes.id, id));

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    S = await import("@/lib/auth/session");
    [{ id }] = await D.db.select({ id: D.schema.personnes.id }).from(D.schema.personnes).where(eq(D.schema.personnes.courriel, "ricardo.etienne@demo.dpo.local"));
    await remettre();
  });
  afterAll(async () => {
    await remettre();
    await globalThis.__pgClient?.end();
  });

  it("huit essais simultanés : cinq vérifiés, trois refusés d'office, puis le compte attend même avec le bon mot de passe", async () => {
    const r = await Promise.all(Array.from({ length: 8 }, () => S.verifierMotDePasseDe(id, "faux")));
    expect(r.filter((x) => x === "faux")).toHaveLength(5);
    expect(r.filter((x) => x === "bloque")).toHaveLength(3);
    expect((await etat()).bloque!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await S.verifierMotDePasseDe(id, BON)).toBe("bloque");
  });

  it("une fois l'attente passée, le bon mot de passe remet le compteur à zéro", async () => {
    await D.db.update(D.schema.personnes).set({ bloqueJusqua: new Date(Date.now() - 1000) }).where(eq(D.schema.personnes.id, id));
    expect(await S.verifierMotDePasseDe(id, "faux")).toBe("faux");
    expect(await etat()).toMatchObject({ echecs: 1 });
    expect(await S.verifierMotDePasseDe(id, BON)).toBe("ok");
    expect(await etat()).toEqual({ echecs: 0, bloque: null });
  });

  it("un échec n'efface jamais un blocage en cours", async () => {
    await remettre();
    for (let i = 0; i < 4; i++) await S.verifierMotDePasseDe(id, "faux");
    expect(await S.verifierMotDePasseDe(id, BON)).toBe("ok"); // le cinquième essai, bon : passe et remet à zéro
    for (let i = 0; i < 5; i++) await S.verifierMotDePasseDe(id, "faux");
    const bloque = (await etat()).bloque;
    expect(await S.verifierMotDePasseDe(id, "faux")).toBe("bloque");
    expect((await etat()).bloque).toEqual(bloque);
  });
});
