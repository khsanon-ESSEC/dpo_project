/** « Vos trois premiers gestes » (première connexion guidée, 29 octobre 2026, revu le 30). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { choisirGestes, GESTES, gestesAccueil, NB_GESTES, profilAccueil, titreAccueil, type CleGeste } from "@/lib/accueil";
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
  it("chaque geste a une fiche du guide qui existe ; au moins trois par rôle", () => {
    for (const [profil, gestes] of Object.entries(GESTES)) {
      expect(gestes.length, profil).toBeGreaterThanOrEqual(NB_GESTES);
      for (const g of gestes) expect(ficheParId(g.fiche), `${profil} → ${g.fiche}`).not.toBeNull();
    }
  });
  it("la carte ne s'ouvre jamais sur un geste déjà fait : les trois premiers pas encore faits", () => {
    // Le cas vu le 30 octobre : un exécutif qui avait déjà ouvert le portefeuille et le rapport au conseil.
    expect(choisirGestes("direction", new Set<CleGeste>(["portefeuille_vu", "conseil_vu"]))).toEqual(["rapport_lu", "charge_vue", "vues_projet"]);
    expect(choisirGestes("agent", new Set())).toEqual(["tache_creee", "tache_faite", "rapport_envoye"]);
    // Il en reste moins de trois : on n'en propose que ce qui reste ; plus rien : pas de carte.
    expect(choisirGestes("externe", new Set<CleGeste>(["tache_a_jour", "tache_faite"]))).toEqual(["temps_note"]);
    expect(choisirGestes("externe", new Set<CleGeste>(["tache_a_jour", "tache_faite", "temps_note"]))).toEqual([]);
  });
  it("cochés une fois faits ; la carte disparaît quand tout est fait, qu'on la masque, ou qu'il n'y a rien à proposer", () => {
    const choisis = ["tache_creee", "tache_faite", "rapport_envoye"];
    expect(gestesAccueil(choisis, new Set<CleGeste>(["tache_creee"]), false)?.map((g) => g.fait)).toEqual([true, false, false]);
    expect(gestesAccueil(choisis, new Set<CleGeste>(["tache_creee", "tache_faite", "rapport_envoye"]), false)).toBeNull();
    expect(gestesAccueil(choisis, new Set(), true)).toBeNull();
    expect(gestesAccueil([], new Set(), false)).toBeNull();
  });
  it("le titre suit le nombre de gestes", () => {
    expect(titreAccueil(3)).toBe("Vos trois premiers gestes");
    expect(titreAccueil(2)).toBe("Vos deux premiers gestes");
    expect(titreAccueil(1)).toBe("Un geste pour prendre la main");
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
    await D.db.update(D.schema.personnes).set({ accueilFermeLe: null, accueilGestes: null });
    await globalThis.__pgClient?.end();
  });

  it("directeur : choisis parmi les gestes pas faits, puis cochés quand il les fait ; « Masquer » ferme la carte", async () => {
    const [p] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.courriel, "marc-antoine.louis@demo.dpo.local"));
    const u = { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false };
    await D.db.delete(D.schema.consultations).where(eq(D.schema.consultations.personneId, p.id));
    // Il a déjà ouvert le portefeuille : ce geste n'est pas proposé.
    await D.db.insert(D.schema.consultations).values({ jour: "2026-10-29", ecran: "/projets", personneId: p.id });
    await D.db.update(D.schema.personnes).set({ accueilGestes: null, accueilFermeLe: null }).where(eq(D.schema.personnes.id, p.id));
    const premiere = await G.accueilDe(await A.acces(u));
    expect(premiere?.map((g) => g.cle)).toEqual(["rapport_lu", "conseil_vu", "charge_vue"]);
    expect(premiere?.every((g) => !g.fait)).toBe(true);
    // Le choix est gardé.
    expect((await D.db.select({ c: D.schema.personnes.accueilGestes }).from(D.schema.personnes).where(eq(D.schema.personnes.id, p.id)))[0].c).toEqual(["rapport_lu", "conseil_vu", "charge_vue"]);
    // « Lire les rapports de l'équipe » : l'écran des rapports de l'équipe ouvert suffit (il n'est pas le destinataire de tous).
    await D.db.insert(D.schema.consultations).values({ jour: "2026-10-30", ecran: "/equipe/rapports", personneId: p.id });
    expect((await G.accueilDe(await A.acces(u)))?.map((g) => g.fait)).toEqual([true, false, false]);
    // Les deux autres faits : la carte disparaît.
    await D.db.insert(D.schema.consultations).values([
      { jour: "2026-10-30", ecran: "/conseil", personneId: p.id },
      { jour: "2026-10-30", ecran: "/charge", personneId: p.id },
    ]);
    expect(await G.accueilDe(await A.acces(u))).toBeNull();
    // Masquer.
    await D.db.update(D.schema.personnes).set({ accueilGestes: null }).where(eq(D.schema.personnes.id, p.id));
    await D.db.delete(D.schema.consultations).where(eq(D.schema.consultations.personneId, p.id));
    expect(await G.accueilDe(await A.acces(u))).not.toBeNull();
    await G.fermerAccueilDe(p.id);
    expect(await G.accueilDe(await A.acces(u))).toBeNull();
  });

  it("qui a déjà tout fait ne voit pas la carte", async () => {
    const [p] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.courriel, "fabienne.michel@demo.dpo.local"));
    const u = { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false };
    const r = await G.accueilDe(await A.acces(u));
    const [{ c }] = await D.db.select({ c: D.schema.personnes.accueilGestes }).from(D.schema.personnes).where(eq(D.schema.personnes.id, p.id));
    // Ce qui est proposé n'est jamais déjà fait.
    expect(r === null ? c : r.every((g) => !g.fait)).toBeTruthy();
  });
});
