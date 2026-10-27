/**
 * Journal des réunions et bilan, contre la base de démonstration (voir tests/preparer-base.ts).
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as ReunionsModule from "@/lib/donnees/reunions";
import type * as RapportModule from "@/lib/donnees/rapport";
import type * as BilanModule from "@/lib/donnees/bilan";
import type * as ChargeModule from "@/lib/donnees/charge";
import { lireReunions } from "@/lib/modeles";
import { mois, semainesJusqua } from "@/lib/bilan";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("journal des réunions et bilan", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let RE: typeof ReunionsModule;
  let R: typeof RapportModule;
  let B: typeof BilanModule;
  let CH: typeof ChargeModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const LUNDI = "2026-10-26";
  const saisie = (o: Partial<ReunionsModule.SaisieReunion> = {}): ReunionsModule.SaisieReunion => ({ titre: "Point imprévu", jour: "2026-10-30", heure: "08:30", dureeMinutes: "45", projetId: "", notes: "", participants: [], ...o });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    RE = await import("@/lib/donnees/reunions");
    R = await import("@/lib/donnees/rapport");
    B = await import("@/lib/donnees/bilan");
    CH = await import("@/lib/donnees/charge");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, theme: p.theme, doitChangerMotDePasse: false });
    }
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("la semaine de Daphnée : réunions notées par elle et par les autres", async () => {
    const liste = await RE.reunionsDe(qui("daphnee.joseph").id, LUNDI, "2026-11-01");
    expect(liste.map((r) => r.titre)).toEqual(expect.arrayContaining(["Point hebdomadaire Solutions technologiques", "Atelier sécurité avec la DTI", "Comité de pilotage UNIBANKOnline Retail"]));
    expect(liste.find((r) => r.titre === "Point hebdomadaire Solutions technologiques")?.noteePar?.nom).toBe("Marc-Antoine Louis");
    expect((await RE.minutesDeReunion([qui("daphnee.joseph").id], LUNDI, "2026-11-01")).get(qui("daphnee.joseph").id)).toBe(390);
  });

  it("noter une réunion : contrôles, participants prévenus, une seule saisie pour tous", async () => {
    const lp = await acces("ludovic.pierre");
    expect(await RE.noterReunion(lp, saisie({ titre: " " }), "tous")).toHaveProperty("erreur");
    expect(await RE.noterReunion(lp, saisie({ dureeMinutes: "2" }), "tous")).toHaveProperty("erreur");
    expect(await RE.noterReunion(lp, saisie({ jour: "30/10" }), "tous")).toHaveProperty("erreur");
    const avant = (await RE.minutesDeReunion([qui("wesner.bazile").id], LUNDI, "2026-11-01")).get(qui("wesner.bazile").id)!;
    const r = await RE.noterReunion(lp, saisie({ participants: [qui("wesner.bazile").id] }), "tous");
    expect(r).toHaveProperty("id");
    const id = (r as { id: string }).id;
    expect((await RE.minutesDeReunion([qui("wesner.bazile").id], LUNDI, "2026-11-01")).get(qui("wesner.bazile").id)).toBe(avant + 45);
    const notifs = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, qui("wesner.bazile").id), eq(D.schema.notifications.type, "reunion")));
    expect(notifs.some((n) => n.texte.includes("Point imprévu") && n.texte.includes("inutile de la noter"))).toBe(true);
    // Seule la personne qui l'a notée la modifie ou la supprime ; un participant peut s'en retirer.
    const wb = await acces("wesner.bazile");
    expect(await RE.modifierReunion(wb, id, saisie({ titre: "Autre titre" }), "tous")).toHaveProperty("erreur");
    expect(await RE.supprimerReunion(wb, id)).toHaveProperty("erreur");
    expect(await RE.modifierReunion(lp, id, saisie({ titre: "Point imprévu avec Wesner", dureeMinutes: 60, participants: [qui("wesner.bazile").id] }), "tous")).toEqual({ ok: true });
    expect(await RE.quitterReunion(lp, id)).toHaveProperty("erreur");
    expect(await RE.quitterReunion(wb, id)).toEqual({ ok: true });
    expect((await RE.minutesDeReunion([qui("wesner.bazile").id], LUNDI, "2026-11-01")).get(qui("wesner.bazile").id)).toBe(avant);
    expect(await RE.supprimerReunion(lp, id)).toEqual({ ok: true });
  });

  it("un projet qu'on ne voit pas ne s'attache pas à une réunion", async () => {
    const fm = await acces("fabienne.michel");
    const [uc] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "UC"));
    expect(await RE.noterReunion(fm, saisie({ projetId: uc.id }), await A.idsProjetsVisibles(fm))).toEqual({ erreur: "Projet introuvable." });
  });

  it("le rapport fige les réunions de la semaine à l'envoi ; la direction n'en voit pas le détail", async () => {
    // Le rapport de Sophonie pour la semaine prochaine (celui de cette semaine sert à d'autres tests).
    const sc = qui("sophonie.charles");
    const brouillon = await R.obtenirOuCreerRapport(sc.id, "2026-11-02");
    expect(brouillon.statut).toBe("brouillon");
    expect(R.formulaireDe(brouillon).some((c) => c.type === "reunions")).toBe(true);
    await D.db.insert(D.schema.lignesRapport).values({ rapportId: brouillon.id, champId: "fait", partie: "fait", texte: "Supports de formation relus", ordre: 99 });
    // Elle accepte ce qui est proposé (feux, charge).
    await D.db.execute(sql`update reponses_rapport set valeur = coalesce(propose, 'normale') where rapport_id = ${brouillon.id} and valeur = ''`);
    const r = await R.envoyerRapport(brouillon.id, sc.id);
    expect(r).toEqual({ ok: true });
    const [rep] = await D.db.select().from(D.schema.reponsesRapport).where(and(eq(D.schema.reponsesRapport.rapportId, brouillon.id), eq(D.schema.reponsesRapport.champId, "reunions")));
    const figees = lireReunions(rep.valeur);
    expect(figees?.reunions.map((x) => x.titre)).toEqual(["Atelier avec la DRH : plateforme de recrutement"]);
    expect(figees?.minutes).toBe(120);
    expect(figees?.reunions[0].avec).toBe(2);
    const parMl = await R.lireRapport(await acces("marc-antoine.louis"), brouillon.id);
    expect(parMl?.formulaire.some((c) => c.id === "reunions")).toBe(true);
    const parFd = await R.lireRapport(await acces("frantz.desrosiers"), brouillon.id);
    expect(parFd?.formulaire.some((c) => c.id === "reunions")).toBe(false);
  });

  it("la charge tient compte des réunions à venir", async () => {
    const { lignes } = await CH.chargeDesPersonnes([qui("daphnee.joseph").id], 2);
    const prochaine = lignes[0].charge.semaines[1];
    expect(prochaine.reunions).toBe(3.5); // comité de pilotage (1 h 30) et atelier DRH (2 h)
    expect(prochaine.capacite).toBe(36.5);
  });

  it("bilan : semaines et mois, réunions et rapports compris", async () => {
    const dj = qui("daphnee.joseph").id;
    const semaines = semainesJusqua("2026-10-30", 8);
    const m = (await B.bilans([dj], semaines)).get(dj)!;
    expect(m).toHaveLength(8);
    expect(m.at(-1)!.taches).toBeGreaterThanOrEqual(3);
    expect(m.at(-1)!.minutesReunion).toBe(390);
    expect(m.slice(0, 7).every((x) => x.taches >= 1)).toBe(true);
    const [oct] = (await B.bilans([dj], [mois("2026-10")])).get(dj)!;
    expect(oct.rapportsAttendus).toBe(4);
    expect(oct.partReunion).toBeGreaterThan(0);
    // Les exécutifs n'ont pas de rapport attendu.
    const [fdOct] = (await B.bilans([qui("frantz.desrosiers").id], [mois("2026-10")])).get(qui("frantz.desrosiers").id)!;
    expect(fdOct.rapportsAttendus).toBe(0);
  });
});
