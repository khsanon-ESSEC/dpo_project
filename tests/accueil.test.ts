/** « Vos trois premiers gestes » (première connexion guidée, 29 octobre 2026). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GESTES, gestesAccueil, profilAccueil, type CleGeste } from "@/lib/accueil";
import { ficheParId } from "@/lib/guide";
import type * as AccesModule from "@/lib/acces";
import type * as AccueilModule from "@/lib/donnees/accueil";
import type * as DbModule from "@/db";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe("les gestes selon le rôle", () => {
  it("le profil", () => {
    expect(profilAccueil({ externe: true, executif: true, directeur: false, equipeDirecte: 3 })).toBe("externe");
    expect(profilAccueil({ executif: true, directeur: false, equipeDirecte: 0 })).toBe("direction");
    expect(profilAccueil({ executif: false, directeur: true, equipeDirecte: 2 })).toBe("direction");
    expect(profilAccueil({ executif: false, directeur: false, equipeDirecte: 2 })).toBe("chef");
    expect(profilAccueil({ executif: false, directeur: false, equipeDirecte: 0 })).toBe("agent");
  });
  it("trois gestes par rôle, chacun avec une fiche du guide qui existe", () => {
    for (const [profil, gestes] of Object.entries(GESTES)) {
      expect(gestes, profil).toHaveLength(3);
      for (const g of gestes) expect(ficheParId(g.fiche), `${profil} → ${g.fiche}`).not.toBeNull();
    }
  });
  it("cochés une fois faits ; la carte disparaît quand tout est fait ou qu'on la masque", () => {
    const faits = new Set<CleGeste>(["tache_creee"]);
    expect(gestesAccueil("agent", faits, false)?.map((g) => g.fait)).toEqual([true, false, false]);
    expect(gestesAccueil("agent", new Set<CleGeste>(["tache_creee", "tache_faite", "rapport_envoye"]), false)).toBeNull();
    expect(gestesAccueil("agent", new Set(), true)).toBeNull();
  });
});

describe.skipIf(!URL_TEST)("les gestes, contre la base de démonstration", () => {
  let A: typeof AccesModule;
  let G: typeof AccueilModule;
  let D: typeof DbModule;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/accueil");
  });
  afterAll(async () => {
    await D.db.update(D.schema.personnes).set({ accueilFermeLe: null });
    await globalThis.__pgClient?.end();
  });

  it("un geste de lecture se coche à l'ouverture de l'écran ; « Masquer » ferme la carte", async () => {
    const [p] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.courriel, "marc-antoine.louis@demo.dpo.local"));
    const u = { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false };
    await D.db.delete(D.schema.consultations).where(eq(D.schema.consultations.personneId, p.id));
    const avant = await G.accueilDe(await A.acces(u));
    // Directeur : portefeuille, rapport de l'équipe, conseil.
    expect(avant?.map((g) => g.cle)).toEqual(["portefeuille_vu", "rapport_lu", "conseil_vu"]);
    expect(avant?.find((g) => g.cle === "portefeuille_vu")?.fait).toBe(false);
    await D.db.insert(D.schema.consultations).values({ jour: "2026-10-30", ecran: "/projets", personneId: p.id });
    expect((await G.accueilDe(await A.acces(u)))?.find((g) => g.cle === "portefeuille_vu")?.fait).toBe(true);
    await G.fermerAccueilDe(p.id);
    expect(await G.accueilDe(await A.acces(u))).toBeNull();
  });
});
