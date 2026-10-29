/**
 * Données des graphiques contre la base de démonstration : reports de la date de fin (notés à chaque
 * changement, retirés par « Annuler »), avancement d'un projet, réunions en heures-personnes.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as BarreModule from "@/lib/donnees/barre";
import type * as AnnulationsModule from "@/lib/donnees/annulations";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as ReportsModule from "@/lib/donnees/reports-fin";
import type * as GraphiquesModule from "@/lib/donnees/graphiques";
import type * as ChargeModule from "@/lib/donnees/charge";
import type * as BilanModule from "@/lib/donnees/bilan";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("données des graphiques (base de démonstration)", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let B: typeof BarreModule;
  let N: typeof AnnulationsModule;
  let G: typeof GestionModule;
  let R: typeof ReportsModule;
  let Q: typeof GraphiquesModule;
  let C: typeof ChargeModule;
  let BI: typeof BilanModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (cle: string) => gens.get(cle)!;
  const projets = new Map<string, string>();
  const finsAvant = new Map<string, string | null>();
  const projet = async (id: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, id)))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    B = await import("@/lib/donnees/barre");
    N = await import("@/lib/donnees/annulations");
    G = await import("@/lib/donnees/gestion");
    R = await import("@/lib/donnees/reports-fin");
    Q = await import("@/lib/donnees/graphiques");
    C = await import("@/lib/donnees/charge");
    BI = await import("@/lib/donnees/bilan");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      if (!p.courriel) continue;
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select().from(D.schema.projets)) {
      projets.set(p.code, p.id);
      finsAvant.set(p.code, p.dateFinPrevue);
    }
  });
  afterAll(async () => {
    for (const code of ["UR", "CR"]) {
      await D.db.update(D.schema.projets).set({ dateFinPrevue: finsAvant.get(code) ?? null }).where(eq(D.schema.projets.id, projets.get(code)!));
      await D.db.delete(D.schema.reportsFinProjet).where(eq(D.schema.reportsFinProjet.projetId, projets.get(code)!));
    }
    await globalThis.__pgClient?.end();
  });

  it("la barre note le report de la fin ; « Annuler » le retire", async () => {
    const mv = qui("myriam.valcin");
    const ur = projets.get("UR")!;
    const avant = finsAvant.get("UR")!;
    const r = await B.mettreAJourProjetDepuisBarre(mv, await A.acces(mv), { saisie: "UR fin prévue 20/12", projetId: "" });
    expect(r).toMatchObject({ ok: true });
    expect(await R.reportsFinDe(ur)).toEqual([expect.objectContaining({ avant, apres: "2026-12-20" })]);
    expect(await N.annulerAction(await A.acces(mv), r.annulation!)).toMatchObject({ ok: true });
    expect((await projet(ur)).dateFinPrevue).toBe(avant);
    expect(await R.reportsFinDe(ur)).toEqual([]);
  });

  it("la fiche du projet note chaque changement de la fin prévue, pas les autres modifications", async () => {
    const ex = qui("frantz.desrosiers").id;
    const p = await projet(projets.get("CR")!);
    const base = { code: p.code, titre: p.titre, description: p.description, programme: p.programme, strategique: p.strategique, statut: p.statut, chefProjetId: p.chefProjetId ?? "", referentId: p.referentId ?? "", division: p.division, dateEntree: p.dateEntree ?? "", dateFinInitiale: p.dateFinInitiale ?? "", dateFinPrevue: p.dateFinPrevue ?? "", dateLancementPrevue: p.dateLancementPrevue ?? "" };
    expect(await G.modifierProjet(p.id, { ...base, description: `${p.description} ` }, ex)).toEqual({ ok: true });
    expect(await R.reportsFinDe(p.id)).toEqual([]);
    expect(await G.modifierProjet(p.id, { ...base, dateFinPrevue: "2027-03-31" }, ex)).toEqual({ ok: true });
    expect(await G.modifierProjet(p.id, { ...base, dateFinPrevue: "2027-06-30" }, ex)).toEqual({ ok: true });
    const reports = await R.reportsFinDe(p.id);
    expect(reports.map((x) => [x.avant, x.apres])).toEqual([
      [p.dateFinPrevue, "2027-03-31"],
      ["2027-03-31", "2027-06-30"],
    ]);
  });

  it("avancement par période : des cumuls qui ne baissent pas, jusqu'aux tâches non annulées du projet", async () => {
    const ur = projets.get("UR")!;
    const { planBilan } = await import("@/lib/bilan");
    const plan = planBilan("semaine", undefined, "2026-10-30", 10);
    const points = await Q.avancementParPeriode(ur, plan.serie, "2026-10-30");
    expect(points).toHaveLength(8);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].total).toBeGreaterThanOrEqual(points[i - 1].total);
      expect(points[i].faites).toBeGreaterThanOrEqual(points[i - 1].faites);
    }
    const derniere = points.at(-1)!;
    expect(derniere.faites).toBeLessThanOrEqual(derniere.total);
    const taches = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.projetId, ur));
    expect(derniere.total).toBe(taches.filter((t) => !t.annuleeLe).length);
    // Terminées pendant la semaine = l'écart des cumuls.
    expect(derniere.terminees).toBe(derniere.faites - points[6].faites);
    // Une période d'avant la première tâche : rien.
    const [vide] = await Q.avancementParPeriode(ur, [{ debut: "2020-01-06", fin: "2020-01-12" }], "2026-10-30");
    expect(vide).toEqual({ total: 0, faites: 0, terminees: 0, avant: true });
  });

  it("réunions : une réunion compte pour chaque participant suivi (heures-personnes)", async () => {
    const ids = [qui("myriam.valcin").id, qui("fabienne.michel").id];
    const debut = "2026-09-01";
    const fin = "2026-10-31";
    const { parSemaine, parProjet } = await Q.reunionsEnChiffres(ids, debut, fin);
    const somme = (m: Map<unknown, number>) => [...m.values()].reduce((s, v) => s + v, 0);
    expect(somme(parSemaine)).toBe(somme(parProjet));
    const lignes = await D.db
      .select({ minutes: D.schema.reunions.dureeMinutes })
      .from(D.schema.participantsReunion)
      .innerJoin(D.schema.reunions, eq(D.schema.reunions.id, D.schema.participantsReunion.reunionId))
      .where(and(inArray(D.schema.participantsReunion.personneId, ids), gte(D.schema.reunions.jour, debut), lte(D.schema.reunions.jour, fin)));
    expect(somme(parSemaine)).toBe(lignes.reduce((s, l) => s + l.minutes, 0));
    expect(await Q.reunionsEnChiffres([], debut, fin)).toEqual({ parSemaine: new Map(), parProjet: new Map() });
  });

  it("charge prévue : notée une fois par semaine et par personne, puis lue par le bilan", async () => {
    await D.db.delete(D.schema.chargesPrevues);
    const n = await C.noterChargesPrevues();
    expect(n).toBeGreaterThan(5);
    expect(await C.noterChargesPrevues()).toBe(0);
    const lignes = await D.db.select().from(D.schema.chargesPrevues);
    expect(lignes.length).toBe(n);
    // Vendredi 30 octobre 2026 (DATE_DEMO) : un seul jour ouvré compté, la semaine du lundi 26.
    expect(new Set(lignes.map((l) => l.semaine))).toEqual(new Set(["2026-10-26"]));
    expect(lignes.every((l) => l.jours === 1 && l.capacite >= 0 && l.heures >= 0)).toBe(true);
    const mv = qui("myriam.valcin").id;
    const sienne = lignes.find((l) => l.personneId === mv)!;
    const [m] = (await BI.bilans([mv], [{ cle: "2026-10-26", debut: "2026-10-26", fin: "2026-11-01" }])).get(mv)!;
    expect(m.prevuHeures).toBeCloseTo(sienne.heures, 1);
    expect(m.tauxPrevu === null || m.tauxPrevu >= 0).toBe(true);
    // La charge réalisée : des heures de tâches terminées tombées dans la semaine.
    expect(m.heuresRealisees).toBeGreaterThanOrEqual(0);
    await D.db.delete(D.schema.chargesPrevues);
  });
});
