/**
 * Tests de la couche d'accès contre une vraie base PostgreSQL remplie avec les données d'exemple
 * (voir tests/preparer-base.ts). Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as RapportModule from "@/lib/donnees/rapport";
import type * as OrganisationModule from "@/lib/donnees/organisation";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("accès, sur les données d'exemple", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let R: typeof RapportModule;
  let O: typeof OrganisationModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();

  const qui = (courriel: string) => {
    const u = gens.get(courriel);
    if (!u) throw new Error(`inconnu : ${courriel}`);
    return u;
  };
  const accesDe = (courriel: string) => A.acces(qui(courriel));
  const codesVisibles = async (courriel: string) => {
    const v = await A.idsProjetsVisibles(await accesDe(courriel));
    if (v === "tous") return "tous";
    return [...projets].filter(([, id]) => v.has(id)).map(([code]) => code).sort();
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    R = await import("@/lib/donnees/rapport");
    O = await import("@/lib/donnees/organisation");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], {
        id: p.id,
        prenom: p.prenom,
        nom: p.nom,
        poste: p.poste,
        directeur: p.directeur,
        executif: p.executif,
        administrateur: p.administrateur,
        theme: p.theme,
        doitChangerMotDePasse: false,
      });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("l'exécutif voit tous les projets et toutes les personnes", async () => {
    expect(await codesVisibles("frantz.desrosiers")).toBe("tous");
    expect((await accesDe("frantz.desrosiers")).suivis).toBe("toutes");
  });

  it("le directeur d'équipe ne voit que sa direction", async () => {
    const a = await accesDe("marc-antoine.louis");
    expect(A.suitPersonne(a, qui("daphnee.joseph").id)).toBe(true);
    expect(A.suitPersonne(a, qui("fabienne.michel").id)).toBe(false);
    expect(A.suitPersonne(a, qui("nadege.augustin").id)).toBe(false);
    const codes = await codesVisibles("marc-antoine.louis");
    expect(codes).not.toBe("tous");
    expect(codes).toContain("UC");
    expect(codes).not.toContain("AE"); // projet dirigé hors de sa direction
  });

  it("la directrice de la division voit toute la division, pas au-dessus", async () => {
    const a = await accesDe("nadege.augustin");
    expect(a.toutVoir).toBe(false);
    expect(A.suitPersonne(a, qui("fabienne.michel").id)).toBe(true);
    expect(A.suitPersonne(a, qui("thierry.lamy").id)).toBe(true);
    expect(A.suitPersonne(a, qui("frantz.desrosiers").id)).toBe(false);
    expect(await codesVisibles("nadege.augustin")).toContain("AE");
  });

  it("une chargée de projets voit ses projets, pas ceux des autres", async () => {
    const codes = await codesVisibles("daphnee.joseph");
    expect(codes).toEqual(["PR", "UN", "UR"]);
  });

  it("administrateur ne veut pas dire voir plus", async () => {
    const a = await accesDe("jean-robert.noel");
    expect(a.suivis).toEqual(new Set([qui("jean-robert.noel").id]));
    expect(() => A.exigerAccesConseil(a)).toThrow();
  });

  it("rapport au conseil : directeurs et exécutifs seulement", async () => {
    expect(() => A.exigerAccesConseil({ toutVoir: false, directeur: false } as never)).toThrow();
    const ml = await accesDe("marc-antoine.louis");
    expect(() => A.exigerAccesConseil(ml)).not.toThrow();
  });

  it("le chef de projet voit les lignes du vendredi sur son projet, d'où qu'elles viennent", async () => {
    const mv = await accesDe("myriam.valcin");
    const ur = projets.get("UR")!;
    const auteurs = A.auteursLignesVisibles(mv, ur);
    expect(auteurs).toBe("toutes");
    const groupes = await R.lignesDuProjetCetteSemaine(ur, auteurs!);
    expect(groupes.map((g) => g.prenom)).toContain("Ricardo");
    expect(groupes.flatMap((g) => g.lignes).every((l) => l.texte.length > 0)).toBe(true);
  });

  it("sans être chef du projet ni directeur, aucune ligne du vendredi", async () => {
    const jn = await accesDe("jean-robert.noel");
    expect(A.auteursLignesVisibles(jn, projets.get("UR")!)).toBeNull();
  });

  it("historique : chacun retrouve tous ses rapports envoyés", async () => {
    const liste = await R.mesRapports(qui("daphnee.joseph").id);
    expect(liste.filter((r) => r.statut === "envoye").length).toBeGreaterThanOrEqual(6);
    expect(liste.every((r) => r.auteurId === qui("daphnee.joseph").id)).toBe(true);
  });

  it("historique de l'équipe : le directeur lit sa direction, pas au-delà", async () => {
    const ml = await accesDe("marc-antoine.louis");
    const auteurs = await R.auteursDontJeLisLesRapports(ml);
    expect(auteurs).toContain(qui("daphnee.joseph").id);
    expect(auteurs).not.toContain(qui("fabienne.michel").id);
    expect((await R.historiqueDe(ml, qui("daphnee.joseph").id)).length).toBeGreaterThanOrEqual(6);
    expect(await R.historiqueDe(ml, qui("fabienne.michel").id)).toEqual([]);
  });

  it("historique : un collègue ou un administrateur ne lit pas les rapports des autres", async () => {
    const jn = await accesDe("jean-robert.noel");
    expect(await R.auteursDontJeLisLesRapports(jn)).toEqual([]);
    expect(await R.historiqueDe(jn, qui("daphnee.joseph").id)).toEqual([]);
  });

  it("la semaine dernière : ce qui était prévu, et ce qui est déjà repris", async () => {
    const dj = qui("daphnee.joseph");
    const prec = await R.monRapportPrecedent(dj.id);
    const prevues = prec!.lignes.filter((l) => l.partie === "prochaine");
    expect(prevues.length).toBe(5);
    const actuel = await R.obtenirOuCreerRapport(dj.id);
    const lignes = await R.lignesDuRapport(actuel.id);
    const reprises = prevues.filter((l) => R.dejaReprise(l, lignes));
    expect(reprises.map((l) => l.texte)).toContain("Point 3 de l'audit de sécurité");
    expect(prevues.filter((l) => !R.dejaReprise(l, lignes)).map((l) => l.texte)).toContain("Relancer la DTI pour les accès de test");
  });

  it("seul un exécutif peut donner le rôle Exécutif", async () => {
    const jn = qui("jean-robert.noel");
    await expect(
      O.modifierPersonne(jn.id, jn.id, { equipeId: null, superieurId: null, poste: "Analyste", actif: true, directeur: false, executif: true, administrateur: true, capaciteHeures: 40 }),
    ).rejects.toThrow(/exécutif/);
  });
});
