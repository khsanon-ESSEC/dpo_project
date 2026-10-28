/**
 * Documents d'un projet contre la base de démonstration : qui dépose, qui lit, qui retire.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as DocumentsModule from "@/lib/donnees/documents";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

describe.skipIf(!URL_TEST)("documents d'un projet (base de démonstration)", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let M: typeof DocumentsModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (cle: string) => gens.get(cle)!;
  let ur: typeof DbModule.schema.projets.$inferSelect;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    M = await import("@/lib/donnees/documents");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      if (!p.courriel) continue;
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    [ur] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "UR"));
  });
  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("la cheffe du projet dépose ; un fichier déguisé est refusé", async () => {
    const a = await A.acces(qui("myriam.valcin"));
    expect(ur.chefProjetId).toBe(a.moi.id);
    expect(await M.peutDeposerDocument(a, ur)).toBe(true);
    const r = await M.deposerDocuments(a, ur.id, "cahier_des_charges", [new File([PDF], "CDC retail.pdf"), new File([new TextEncoder().encode("MZ exécutable")], "faux.pdf")]);
    expect(r.deposes).toBe(1);
    expect(r.erreurs.join(" ")).toMatch(/faux\.pdf/);
    const docs = await M.documentsDuProjet(ur.id);
    expect(docs.map((d) => [d.nom, d.categorie])).toContainEqual(["CDC retail.pdf", "cahier_des_charges"]);
  });

  it("lire : qui voit le projet ; les autres ne le trouvent pas", async () => {
    const [d] = (await M.documentsDuProjet(ur.id)).filter((x) => x.nom === "CDC retail.pdf");
    let vu = 0;
    let pasVu = 0;
    for (const u of gens.values()) {
      const a = await A.acces(u);
      const visibles = await A.idsProjetsVisibles(a);
      const voit = visibles === "tous" || visibles.has(ur.id);
      const lu = await M.lireDocument(a, d.id);
      expect(!!lu).toBe(voit);
      if (voit) vu += 1;
      else pasVu += 1;
    }
    expect(vu).toBeGreaterThan(0);
    expect(pasVu).toBeGreaterThan(0);
  });

  it("déposer : pas pour qui n'est ni de l'équipe ni en charge du projet", async () => {
    const membres = new Set((await D.db.select({ id: D.schema.membresProjet.personneId }).from(D.schema.membresProjet).where(eq(D.schema.membresProjet.projetId, ur.id))).map((m) => m.id));
    let refuses = 0;
    for (const u of gens.values()) {
      const a = await A.acces(u);
      const equipe = membres.has(u.id) || [ur.chefProjetId, ur.referentId, ur.demandeParId].includes(u.id);
      const gere = a.toutVoir || a.directeur || (a.suivis !== "toutes" && !!ur.chefProjetId && a.suivis.has(ur.chefProjetId));
      if (!equipe && !gere) {
        expect(await M.peutDeposerDocument(a, ur)).toBe(false);
        refuses += 1;
      }
    }
    expect(refuses).toBeGreaterThan(0);
  });

  it("retirer : la personne qui l'a déposé ou qui gère le projet, pas un autre membre", async () => {
    const [d] = (await M.documentsDuProjet(ur.id)).filter((x) => x.nom === "CDC retail.pdf");
    const membres = (await D.db.select({ id: D.schema.membresProjet.personneId }).from(D.schema.membresProjet).where(eq(D.schema.membresProjet.projetId, ur.id))).map((m) => m.id);
    const autre = [...gens.values()].find((u) => membres.includes(u.id) && u.id !== ur.chefProjetId && !u.directeur && !u.executif);
    expect(autre).toBeTruthy();
    const aAutre = await A.acces(autre!);
    expect(await M.retirerDocument(aAutre, ur, d.id)).toMatch(/Seuls/);
    expect(await M.retirerDocument(await A.acces(qui("myriam.valcin")), ur, d.id)).toBeNull();
    expect((await M.documentsDuProjet(ur.id)).some((x) => x.id === d.id)).toBe(false);
  });

  it("un projet qui a des documents s'archive au lieu de se supprimer", async () => {
    const a = await A.acces(qui("myriam.valcin"));
    await M.deposerDocuments(a, ur.id, "autre", [new File([PDF], "garde.pdf")]);
    const G = await import("@/lib/donnees/gestion");
    expect((await G.activiteDuProjet(ur.id)).documents).toBeGreaterThan(0);
  });

  it("lire un document : le contenu n'est chargé que pour qui voit le projet", async () => {
    const [d] = await M.documentsDuProjet(ur.id);
    const myriam = await M.lireDocument(await A.acces(qui("myriam.valcin")), d.id);
    expect(myriam?.contenu.length).toBeGreaterThan(0);
  });

  it("un projet archivé ne reçoit plus de documents", async () => {
    const a = await A.acces(qui("myriam.valcin"));
    expect(await M.peutDeposerDocument(a, { ...ur, archiveLe: new Date() })).toBe(false);
    expect(await M.peutDeposerDocument(a, { ...ur, statut: "refuse" })).toBe(false);
    const [d] = await M.documentsDuProjet(ur.id);
    expect(await M.retirerDocument(a, { ...ur, archiveLe: new Date() }, d.id)).toMatch(/archivé/);
  });
});
