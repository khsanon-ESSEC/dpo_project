/** Le courriel du lundi (29 octobre 2026) : quand il part, ce qu'il dit, pour qui. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { estMomentDuLundi, messageLundi } from "@/lib/courriel-regles";
import type { Courriel } from "@/lib/courriel";
import type * as CourrielsModule from "@/lib/donnees/courriels";
import type * as DbModule from "@/db";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe("le courriel du lundi", () => {
  it("le lundi, de 7 h à midi seulement", () => {
    expect(estMomentDuLundi({ jour: "2026-11-02", minutes: 7 * 60 })).toBe(true);
    expect(estMomentDuLundi({ jour: "2026-11-02", minutes: 6 * 60 + 59 })).toBe(false);
    expect(estMomentDuLundi({ jour: "2026-11-02", minutes: 12 * 60 })).toBe(false);
    expect(estMomentDuLundi({ jour: "2026-11-03", minutes: 8 * 60 })).toBe(false);
  });
  const o = {
    prenom: "Fabienne",
    lundi: "2026-11-02",
    retards: [{ titre: "Relire la note <DTI>", jour: "2026-10-28", code: "UR" }],
    echeances: [
      { titre: "Envoyer le compte rendu", jour: "2026-11-03", code: null },
      { titre: "Préparer l'atelier", jour: "2026-11-06", code: "CR" },
    ],
    reunions: [{ titre: "Comité de pilotage", jour: "2026-11-04", heure: "10:00", code: "UR" }],
    detail: "titres" as const,
    lien: "https://pilotage/connexion?suite=/semaine",
  };
  it("les titres, le jour, le projet ; le HTML échappé", () => {
    const m = messageLundi(o)!;
    expect(m.sujet).toBe("Votre semaine du 2 novembre : 2 échéances, 1 tâche en retard, 1 réunion");
    expect(m.texte).toContain("En retard · 1\n  - mer. 28 · UR · Relire la note <DTI>");
    expect(m.texte).toContain("À rendre cette semaine · 2\n  - mar. 3 · Envoyer le compte rendu\n  - ven. 6 · CR · Préparer l'atelier");
    expect(m.texte).toContain("Réunions · 1\n  - mer. 4 à 10 h · UR · Comité de pilotage");
    expect(m.texte).toContain("Ouvrir ma semaine : https://pilotage/connexion?suite=/semaine");
    expect(m.html).toContain("Relire la note &lt;DTI&gt;");
    expect(m.html).not.toContain("<DTI>");
  });
  it("seulement les nombres, si la conformité le préfère", () => {
    const m = messageLundi({ ...o, detail: "nombres" })!;
    expect(m.sujet).toBe("Votre semaine du 2 novembre : 2 échéances, 1 tâche en retard, 1 réunion");
    expect(m.texte).not.toMatch(/Relire|Envoyer|Comité/);
    expect(m.texte).toContain("En retard · 1");
  });
  it("rien à dire : pas de courriel", () => {
    expect(messageLundi({ ...o, retards: [], echeances: [], reunions: [] })).toBeNull();
  });
  it("au-delà de dix lignes : le reste dans l'application", () => {
    const echeances = Array.from({ length: 13 }, (_, i) => ({ titre: `Tâche ${i + 1}`, jour: "2026-11-05" }));
    expect(messageLundi({ ...o, retards: [], reunions: [], echeances })!.texte).toContain("… et 3 de plus dans l'application.");
  });
});

describe.skipIf(!URL_TEST)("la tournée du lundi (base de démonstration)", () => {
  let C: typeof CourrielsModule;
  let D: typeof DbModule;
  let boite: Courriel[] = [];
  const envoyer = async (c: Courriel) => {
    boite.push(c);
  };
  const lundi = (h: number) => ({ jour: "2026-11-02", minutes: h * 60 });
  const adresses = ["fabienne.michel@demo.dpo.local", "ricardo.etienne@demo.dpo.local", "myriam.valcin@demo.dpo.local"];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    C = await import("@/lib/donnees/courriels");
    await D.db.update(D.schema.personnes).set({ courrielLundi: true }).where(inArray(D.schema.personnes.courriel, adresses));
  });
  afterAll(async () => {
    await D.db.update(D.schema.personnes).set({ courrielLundi: false });
    await D.db.delete(D.schema.envoisCourriel);
    await D.db.delete(D.schema.absences);
    delete process.env.COURRIEL_LUNDI;
    await globalThis.__pgClient?.end();
  });

  it("seulement pour qui l'a demandé, le lundi matin, une fois ; pas pour qui est absent toute la semaine", async () => {
    // Myriam est en congé toute la semaine.
    const [myriam] = await D.db.select().from(D.schema.personnes).where(inArray(D.schema.personnes.courriel, ["myriam.valcin@demo.dpo.local"]));
    await D.db.insert(D.schema.absences).values({ personneId: myriam.id, debut: "2026-11-02", fin: "2026-11-06", motif: "conge" });
    expect(await C.tourneeLundi({ envoyer, maintenant: lundi(6), lien: "L" })).toEqual({ envoyes: 0, erreurs: 0 });
    expect(await C.tourneeLundi({ envoyer, maintenant: { jour: "2026-11-03", minutes: 8 * 60 }, lien: "L" })).toEqual({ envoyes: 0, erreurs: 0 });
    const r = await C.tourneeLundi({ envoyer, maintenant: lundi(7), lien: "L" });
    expect(r.erreurs).toBe(0);
    const recus = boite.map((c) => c.a);
    expect(recus.length).toBe(r.envoyes);
    expect(recus.every((x) => adresses.includes(x))).toBe(true);
    expect(recus).not.toContain("myriam.valcin@demo.dpo.local");
    expect(recus.length).toBeGreaterThan(0);
    expect(boite.every((c) => c.sujet.startsWith("Votre semaine du 2 novembre : "))).toBe(true);
    // Une seule fois.
    expect(await C.tourneeLundi({ envoyer, maintenant: lundi(8), lien: "L" })).toEqual({ envoyes: 0, erreurs: 0 });
  });

  it("COURRIEL_LUNDI=nombres : aucun titre de tâche ne part", async () => {
    await D.db.delete(D.schema.envoisCourriel);
    boite = [];
    process.env.COURRIEL_LUNDI = "nombres";
    await C.tourneeLundi({ envoyer, maintenant: lundi(9), lien: "L" });
    expect(boite.length).toBeGreaterThan(0);
    const titres = (await D.db.select({ titre: D.schema.taches.titre }).from(D.schema.taches)).map((t) => t.titre).filter((t) => t.length > 8);
    for (const c of boite) for (const t of titres) expect(c.texte.includes(t), t).toBe(false);
  });
});
