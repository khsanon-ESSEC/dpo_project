/**
 * Garde-fous de l'administrateur (test complet du 28 octobre 2026), contre la base de démonstration :
 * un administrateur qui n'est pas exécutif ne s'ouvre pas le travail des autres ; une fiche hors division
 * désactivée perd son accès et ne le retrouve pas en revenant.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as OrganisationModule from "@/lib/donnees/organisation";
import type * as ImportModule from "@/lib/donnees/import-organisation";
import type * as ExternesModule from "@/lib/donnees/externes";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("garde-fous de l'administrateur (base de démonstration)", () => {
  let D: typeof DbModule;
  let O: typeof OrganisationModule;
  let I: typeof ImportModule;
  let X: typeof ExternesModule;
  const id = new Map<string, string>();
  const qui = (cle: string) => id.get(cle)!;
  const fiche = async (cle: string) => (await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.id, qui(cle))))[0];
  /** La fiche telle qu'elle est, à modifier champ par champ. */
  const telle = async (cle: string) => {
    const p = await fiche(cle);
    return { equipeId: p.equipeId, superieurId: p.superieurId, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, capaciteHeures: p.capaciteHeures, actif: p.actif };
  };
  let ricardoAvant: Awaited<ReturnType<typeof telle>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    O = await import("@/lib/donnees/organisation");
    I = await import("@/lib/donnees/import-organisation");
    X = await import("@/lib/donnees/externes");
    for (const p of await D.db.select().from(D.schema.personnes)) if (p.courriel) id.set(p.courriel.split("@")[0], p.id);
    ricardoAvant = await telle("ricardo.etienne");
  });
  afterAll(async () => {
    await D.db.update(D.schema.personnes).set(ricardoAvant).where(eq(D.schema.personnes.id, qui("ricardo.etienne")));
    await D.db.delete(D.schema.notifications).where(eq(D.schema.notifications.type, "organisation"));
    await globalThis.__pgClient?.end();
  });

  it("un administrateur non exécutif ne se nomme pas supérieur de quelqu'un", async () => {
    const m = { ...(await telle("ricardo.etienne")), superieurId: qui("jean-robert.noel") };
    await expect(O.modifierPersonne(qui("jean-robert.noel"), qui("ricardo.etienne"), m)).rejects.toThrow(O.REFUS_SUIVI);
    expect((await fiche("ricardo.etienne")).superieurId).toBe(ricardoAvant.superieurId);
  });

  it("ni responsable d'une équipe, ni au-dessus de sa propre place", async () => {
    const [equipe] = await D.db.select().from(D.schema.equipes).where(eq(D.schema.equipes.nom, "Organisation et méthodes"));
    await expect(O.definirChefEquipe(qui("jean-robert.noel"), equipe.id, qui("jean-robert.noel"))).rejects.toThrow(O.REFUS_SUIVI);
    const moi = await telle("jean-robert.noel");
    await expect(O.modifierPersonne(qui("jean-robert.noel"), qui("jean-robert.noel"), { ...moi, superieurId: qui("nadege.augustin") })).rejects.toThrow(/autre administrateur/);
    // Son poste, oui.
    await O.modifierPersonne(qui("jean-robert.noel"), qui("jean-robert.noel"), { ...moi, poste: "Analyste principal" });
    expect((await fiche("jean-robert.noel")).poste).toBe("Analyste principal");
    await D.db.update(D.schema.personnes).set({ poste: moi.poste }).where(eq(D.schema.personnes.id, qui("jean-robert.noel")));
  });

  it("le rôle Directeur, la fiche et le mot de passe d'un exécutif ou d'un directeur : par un exécutif", async () => {
    await expect(O.modifierPersonne(qui("jean-robert.noel"), qui("ricardo.etienne"), { ...(await telle("ricardo.etienne")), directeur: true })).rejects.toThrow(/Directeur/);
    await expect(O.modifierPersonne(qui("nadege.augustin"), qui("frantz.desrosiers"), { ...(await telle("frantz.desrosiers")), poste: "Autre" })).rejects.toThrow(/exécutif/);
    await expect(O.reinitialiserMotDePasse(qui("jean-robert.noel"), qui("nadege.augustin"))).rejects.toThrow(/exécutif/);
    await expect(O.reinitialiserMotDePasse(qui("jean-robert.noel"), qui("frantz.desrosiers"))).rejects.toThrow(/exécutif/);
  });

  it("un exécutif change le supérieur ; la personne en est avertie", async () => {
    await O.modifierPersonne(qui("frantz.desrosiers"), qui("ricardo.etienne"), { ...(await telle("ricardo.etienne")), superieurId: qui("nadege.augustin") });
    const alertes = await D.db
      .select()
      .from(D.schema.notifications)
      .where(and(eq(D.schema.notifications.personneId, qui("ricardo.etienne")), eq(D.schema.notifications.type, "organisation")));
    expect(alertes).toHaveLength(1);
    expect(alertes[0].texte).toContain("Nadège Augustin");
    await D.db.update(D.schema.personnes).set(ricardoAvant).where(eq(D.schema.personnes.id, qui("ricardo.etienne")));
  });

  it("l'import ne passe pas outre : se nommer supérieur par un fichier est refusé, sans rien écrire", async () => {
    const courriels = new Map((await D.db.select().from(D.schema.personnes)).map((p) => [p.id, p.courriel]));
    const lignes = (await I.tableauOrganisation()).map(([prenom, nom, courriel, poste, equipe, superieur], i) => ({
      ligne: i + 2,
      prenom,
      nom,
      courriel,
      poste,
      equipe,
      superieur: courriel === "ricardo.etienne@demo.dpo.local" ? courriels.get(qui("jean-robert.noel"))! : superieur,
    }));
    const r = await I.appliquerImport(qui("jean-robert.noel"), lignes, "fichier");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refus).toBe(O.REFUS_SUIVI);
    expect((await fiche("ricardo.etienne")).superieurId).toBe(ricardoAvant.superieurId);
  });

  it("une fiche hors division désactivée perd son accès, et ne le retrouve pas en revenant par son nom", async () => {
    const avant = await fiche("nathalie.celestin");
    expect(avant.motDePasseHash).toBeTruthy();
    await X.modifierExterne(qui("frantz.desrosiers"), avant.id, { prenom: avant.prenom, nom: avant.nom, organisation: avant.organisation, poste: avant.poste, courriel: avant.courriel ?? "", actif: false });
    expect(await fiche("nathalie.celestin")).toMatchObject({ actif: false, motDePasseHash: null });
    const revenue = await X.trouverOuCreerExterne(`${avant.prenom} ${avant.nom}`, avant.organisation, qui("myriam.valcin"));
    expect(revenue).toBe(avant.id);
    expect(await fiche("nathalie.celestin")).toMatchObject({ actif: true, motDePasseHash: null });
    await D.db.update(D.schema.personnes).set({ actif: true, motDePasseHash: avant.motDePasseHash, doitChangerMotDePasse: avant.doitChangerMotDePasse }).where(eq(D.schema.personnes.id, avant.id));
  });
});
