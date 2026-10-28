/**
 * Le brouillon du vendredi suit la semaine et reprend la semaine dernière : un blocage non résolu revient seul,
 * avec la semaine où il est apparu ; ce qui est résolu ou retiré ne revient pas.
 * Sur le brouillon de Sophonie : celui de Daphnée sert à d'autres tests.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as RapportModule from "@/lib/donnees/rapport";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("rapport : la semaine dernière reconduite (base de démonstration)", () => {
  let D: typeof DbModule;
  let R: typeof RapportModule;
  let auteurId = "";
  let precedentId = "";
  let semainePrecedente = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    process.env.DATE_DEMO = "2026-10-30";
    D = await import("@/db");
    R = await import("@/lib/donnees/rapport");
    const [p] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.courriel, "sophonie.charles@demo.dpo.local"));
    auteurId = p.id;
    const prec = await R.monRapportPrecedent(auteurId, R.semaineCourante());
    if (!prec) throw new Error("pas de rapport précédent dans les données d'exemple");
    precedentId = prec.rapport.id;
    semainePrecedente = prec.rapport.semaine;
    const f = R.formulaireDe(prec.rapport);
    const bloque = R.champDeRubrique(f, "bloque")!;
    const ajout = async (cle: string, v: Partial<typeof D.schema.lignesRapport.$inferInsert>) => {
      const [l] = await D.db
        .insert(D.schema.lignesRapport)
        .values({ rapportId: precedentId, champId: bloque.id, partie: "bloque", texte: "", ordre: 900, ...v })
        .returning();
      ids[cle] = l.id;
    };
    await ajout("ouvert", { texte: "Signature de la DRH sur la convention de stage" });
    await ajout("ancien", { texte: "Salle du comité indisponible", depuisSemaine: "2026-10-12" });
    await ajout("resolu", { texte: "Droits sur l'intranet de test", resolu: true });
  });
  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  const brouillon = async () => {
    const r = await R.obtenirOuCreerRapport(auteurId, R.semaineCourante());
    await R.completerBrouillon(r, { marquer: false });
    const [frais] = await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, r.id));
    return { r: frais, lignes: await R.lignesDuRapport(r.id) };
  };

  it("un blocage non résolu revient, avec la semaine où il est apparu ; un blocage résolu ne revient pas", async () => {
    const { lignes } = await brouillon();
    const ouvert = lignes.find((l) => l.texte === "Signature de la DRH sur la convention de stage");
    expect(ouvert).toMatchObject({ partie: "bloque", repriseDeId: ids.ouvert, depuisSemaine: semainePrecedente });
    expect(lignes.find((l) => l.texte === "Salle du comité indisponible")?.depuisSemaine).toBe("2026-10-12");
    expect(lignes.some((l) => l.texte === "Droits sur l'intranet de test")).toBe(false);
  });

  it("ouvrir le brouillon plusieurs fois ne duplique rien", async () => {
    await brouillon();
    const { lignes } = await brouillon();
    expect(lignes.filter((l) => l.texte === "Signature de la DRH sur la convention de stage").length).toBe(1);
  });

  it("un blocage retiré du brouillon ne revient pas", async () => {
    const { r, lignes } = await brouillon();
    const l = lignes.find((x) => x.texte === "Salle du comité indisponible")!;
    await D.db.delete(D.schema.lignesRapport).where(eq(D.schema.lignesRapport.id, l.id));
    await D.db.update(D.schema.rapportsHebdo).set({ ecartees: [...r.ecartees, `r:${l.repriseDeId}`] }).where(eq(D.schema.rapportsHebdo.id, r.id));
    const apres = await brouillon();
    expect(apres.lignes.some((x) => x.texte === "Salle du comité indisponible")).toBe(false);
  });

  it("le brouillon reprend aussi, à chaque ouverture, une tâche terminée depuis", async () => {
    const [t] = await D.db
      .select()
      .from(D.schema.taches)
      .where(and(eq(D.schema.taches.assigneId, auteurId), eq(D.schema.taches.statut, "a_faire")))
      .limit(1);
    await D.db.update(D.schema.taches).set({ statut: "faite", termineeLe: new Date("2026-10-29T15:00:00Z") }).where(eq(D.schema.taches.id, t.id));
    const { lignes } = await brouillon();
    expect(lignes.some((l) => l.tacheId === t.id && l.partie === "fait")).toBe(true);
    // Remis en l'état pour les autres tests.
    await D.db.update(D.schema.taches).set({ statut: "a_faire", termineeLe: null }).where(eq(D.schema.taches.id, t.id));
  });
});
