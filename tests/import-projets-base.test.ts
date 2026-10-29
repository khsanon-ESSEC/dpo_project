/**
 * Import en vrac des projets et des tâches, contre la base de démonstration. Le test retire ce qu'il a importé.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as ImportModule from "@/lib/donnees/import-projets";
import type { Utilisateur } from "@/lib/auth/session";
import type { LigneBrute } from "@/lib/import-projets";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("import en vrac des projets et des tâches", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let I: typeof ImportModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (c: string) => gens.get(c)!;
  const acces = (c: string) => A.acces(qui(c));
  const ligne = (n: number, valeurs: Record<string, string>): LigneBrute => ({ ligne: n, valeurs });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    I = await import("@/lib/donnees/import-projets");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("réservé aux exécutifs : un administrateur ou une cheffe de projet ne l'importe pas", async () => {
    expect(I.peutImporterProjets(await acces("frantz.desrosiers"))).toBe(true);
    expect(I.peutImporterProjets(await acces("jean-robert.noel"))).toBe(false); // administrateur
    expect(I.peutImporterProjets(await acces("myriam.valcin"))).toBe(false);
    expect(await I.appliquerImportProjets(await acces("jean-robert.noel"), [ligne(2, { titre: "X", chef: "daphnee.joseph@demo.dpo.local" })])).toHaveProperty("erreur");
  });

  it("projets : aperçu (erreurs par ligne), puis import complet ; tâches avec un livrable créé", async () => {
    const fd = await acces("frantz.desrosiers");
    // Une ligne en erreur bloque tout.
    const mauvais = await I.planImportProjets([
      ligne(2, { code: "UR", titre: "Code déjà pris", chef: "daphnee.joseph@demo.dpo.local" }),
      ligne(3, { titre: "Sans chef" }),
      ligne(4, { titre: "Chef inconnu", chef: "personne@nulle.part" }),
      ligne(5, { titre: "Date fausse", chef: "daphnee.joseph@demo.dpo.local", dateFinPrevue: "31/02/2027" }),
    ]);
    expect(mauvais.projets).toHaveLength(0);
    expect(mauvais.erreurs.map((e) => e.ligne)).toEqual([2, 3, 4, 5]);
    expect(mauvais.erreurs[0].message).toMatch(/UR est déjà pris/);

    const lignes = [
      ligne(2, {
        code: "IM",
        titre: "Projet importé",
        chef: "daphnee.joseph@demo.dpo.local",
        equipe: "ricardo.etienne@demo.dpo.local; joel.dorval@demo.dpo.local",
        programme: "Programme importé",
        statut: "En cours",
        priorite: "Haute",
        strategique: "oui",
        dateEntree: "02/11/2026",
        dateFinPrevue: "31/03/2027",
      }),
      ligne(3, { titre: "Second projet importé", chef: "myriam.valcin@demo.dpo.local" }),
    ];
    const plan = await I.planImportProjets(lignes);
    expect(plan.erreurs).toEqual([]);
    expect(plan.nouveauxProgrammes).toEqual(["Programme importé"]);
    const r = await I.appliquerImportProjets(fd, lignes);
    expect(r).toEqual({ ok: true, n: 2 });
    const [im] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "IM"));
    expect(im).toMatchObject({ titre: "Projet importé", statut: "en_cours", priorite: "haute", strategique: true, chefProjetId: qui("daphnee.joseph").id, dateFinPrevue: "2027-03-31", dateFinInitiale: "2027-03-31", programme: "Programme importé", demandeParId: null });
    const membres = await D.db.select().from(D.schema.membresProjet).where(eq(D.schema.membresProjet.projetId, im.id));
    expect(membres.map((m) => m.personneId).sort()).toEqual([qui("ricardo.etienne").id, qui("joel.dorval").id].sort());
    // Réimporter le même fichier : les codes sont pris, rien n'est créé deux fois.
    expect((await I.planImportProjets(lignes)).erreurs.length).toBe(1);

    // Tâches : un livrable nommé qui manque est créé une fois ; la personne entre dans l'équipe.
    const taches = [
      ligne(2, { projet: "IM", titre: "Cahier des charges", pour: "ricardo.etienne@demo.dpo.local", livrable: "Cahier validé", echeance: "20/11/2026", estimation: "12" }),
      ligne(3, { projet: "im", titre: "Revue du cahier", pour: "sophonie.charles@demo.dpo.local", livrable: "Cahier validé", statut: "Faite" }),
      ligne(4, { titre: "Hors projet", pour: "joel.dorval@demo.dpo.local" }),
    ];
    const pt = await I.planImportTaches(fd, taches);
    expect(pt.erreurs).toEqual([]);
    expect(pt.nouveauxLivrables).toEqual([{ projetCode: "IM", libelle: "Cahier validé" }]);
    expect(await I.planImportTaches(fd, [ligne(2, { projet: "ZZ", titre: "?", pour: "joel.dorval@demo.dpo.local" })])).toMatchObject({ erreurs: [{ ligne: 2 }] });
    const rt = await I.appliquerImportTaches(fd, taches);
    expect(rt).toEqual({ ok: true, n: 3, livrables: 1 });
    const creees = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.projetId, im.id));
    expect(creees).toHaveLength(2);
    expect(new Set(creees.map((t) => t.livrableId)).size).toBe(1);
    expect(creees.find((t) => t.titre === "Revue du cahier")).toMatchObject({ statut: "faite" });
    const equipe = await D.db.select().from(D.schema.membresProjet).where(eq(D.schema.membresProjet.projetId, im.id));
    expect(equipe.some((m) => m.personneId === qui("sophonie.charles").id)).toBe(true);

    // Remise en état.
    const projetsImportes = await D.db.select({ id: D.schema.projets.id }).from(D.schema.projets).where(inArray(D.schema.projets.titre, ["Projet importé", "Second projet importé"]));
    const ids = projetsImportes.map((p) => p.id);
    const tachesImportees = await D.db.select({ id: D.schema.taches.id }).from(D.schema.taches).where(inArray(D.schema.taches.titre, ["Cahier des charges", "Revue du cahier", "Hors projet"]));
    const tids = tachesImportees.map((t) => t.id);
    await D.db.delete(D.schema.evenementsTache).where(inArray(D.schema.evenementsTache.tacheId, tids));
    await D.db.delete(D.schema.taches).where(inArray(D.schema.taches.id, tids));
    await D.db.delete(D.schema.notifications).where(inArray(D.schema.notifications.lien, ids.map((id) => `/projets/${id}`)));
    await D.db.delete(D.schema.projets).where(inArray(D.schema.projets.id, ids));
    await D.db.delete(D.schema.listesProjet).where(eq(D.schema.listesProjet.libelle, "Programme importé"));
  });
});
