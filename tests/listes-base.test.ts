/**
 * Listes de référence des projets (programmes, divisions), contre la base de démonstration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as ListesModule from "@/lib/donnees/listes";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("listes des programmes et des divisions", () => {
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let L: typeof ListesModule;
  const gens = new Map<string, string>();
  const projets = new Map<string, string>();
  const projet = async (code: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get(code)!)))[0];
  const champs = (p: Awaited<ReturnType<typeof projet>>) => ({
    code: p.code,
    titre: p.titre,
    description: p.description,
    programme: p.programme,
    strategique: p.strategique,
    statut: p.statut as string,
    chefProjetId: p.chefProjetId ?? "",
    referentId: p.referentId ?? "",
    division: p.division,
    dateEntree: p.dateEntree ?? "",
    dateFinInitiale: p.dateFinInitiale ?? "",
    dateFinPrevue: p.dateFinPrevue ?? "",
    dateLancementPrevue: p.dateLancementPrevue ?? "",
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    G = await import("@/lib/donnees/gestion");
    L = await import("@/lib/donnees/listes");
    for (const p of await D.db.select().from(D.schema.personnes)) gens.set((p.courriel ?? p.id).split("@")[0], p.id);
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("les listes sont remplies avec les valeurs des projets existants", async () => {
    const l = await L.choixListes();
    expect(l.programme).toContain("Amélioration de l'expérience client");
    expect(l.division).toContain("Division Réseau et succursales");
  });

  it("une valeur hors liste est refusée ; la casse et les espaces ne comptent pas", async () => {
    expect(await L.valeurDeListe("programme", "")).toBe("");
    expect(await L.valeurDeListe("programme", "  amélioration de L'EXPÉRIENCE   client ")).toBe("Amélioration de l'expérience client");
    expect(await L.valeurDeListe("programme", "Programme inventé")).toBeNull();
    expect(await L.valeurDeListe("division", "Division inventée")).toBeNull();
    const r = await G.proposerProjet(
      { titre: "Projet au programme inventé", description: "", justification: "Pour le test.", programme: "Programme inventé", strategique: false, finSouhaitee: "", chefSuggereId: "", code: "", division: "" },
      gens.get("joel.dorval")!,
    );
    expect(r).toEqual({ erreur: L.MESSAGE_HORS_LISTE.programme });
  });

  it("ajouter, renommer (les projets suivent), retirer (le projet garde sa valeur)", async () => {
    const admin = gens.get("jean-robert.noel")!;
    expect(await L.ajouterValeur("programme", "Efficacité opérationnelle", admin)).toEqual({ ok: true, libelle: "Efficacité opérationnelle" });
    expect(await L.ajouterValeur("programme", "efficacité  opérationnelle", admin)).toEqual({ erreur: "« Efficacité opérationnelle » est déjà dans la liste." });
    // Un projet prend la nouvelle valeur.
    const ae = await projet("AE");
    const avant = { programme: ae.programme, division: ae.division };
    const chef = ae.chefProjetId!;
    expect(await G.modifierProjet(ae.id, { ...champs(ae), programme: "Efficacité opérationnelle" }, chef)).toEqual({ ok: true });
    expect((await projet("AE")).programme).toBe("Efficacité opérationnelle");
    // Renommer : le projet suit.
    const v = (await L.listesProjet()).programme.find((x) => x.libelle === "Efficacité opérationnelle")!;
    expect(v.projets).toBe(1);
    expect(await L.renommerValeur(v.id, "Efficacité des opérations", admin)).toEqual({ ok: true });
    expect((await projet("AE")).programme).toBe("Efficacité des opérations");
    // Retirer : plus proposée, mais le projet la garde et peut être enregistré tel quel.
    expect(await L.changerEtatValeur(v.id, false, admin)).toEqual({ ok: true });
    expect((await L.choixListes()).programme).not.toContain("Efficacité des opérations");
    expect(await G.modifierProjet(ae.id, { ...champs(await projet("AE")), titre: ae.titre }, chef)).toEqual({ ok: true });
    expect((await projet("AE")).programme).toBe("Efficacité des opérations");
    // Mais un autre projet ne peut pas la prendre.
    const pr = await projet("PR");
    expect(await G.modifierProjet(pr.id, { ...champs(pr), programme: "Efficacité des opérations" }, pr.chefProjetId!)).toEqual({ erreur: L.MESSAGE_HORS_LISTE.programme });
    // Remise en état.
    expect(await G.modifierProjet(ae.id, { ...champs(await projet("AE")), ...avant }, chef)).toEqual({ ok: true });
    await D.db.delete(D.schema.listesProjet).where(eq(D.schema.listesProjet.id, v.id));
  });

  it("une division de la liste est acceptée à la modification ; une autre est refusée", async () => {
    const ae = await projet("AE");
    expect(await G.modifierProjet(ae.id, { ...champs(ae), division: "Division Réseau et succursales" }, ae.chefProjetId!)).toEqual({ ok: true });
    expect((await projet("AE")).division).toBe("Division Réseau et succursales");
    expect(await G.modifierProjet(ae.id, { ...champs(await projet("AE")), division: "Division inventée" }, ae.chefProjetId!)).toEqual({ erreur: L.MESSAGE_HORS_LISTE.division });
    expect(await G.modifierProjet(ae.id, { ...champs(await projet("AE")), division: ae.division }, ae.chefProjetId!)).toEqual({ ok: true });
  });

  it("gérer les listes : administrateurs et exécutifs seulement", () => {
    expect(L.peutGererListes({ administrateur: true, externe: false }, { toutVoir: false })).toBe(true);
    expect(L.peutGererListes({ administrateur: false, externe: false }, { toutVoir: true })).toBe(true);
    expect(L.peutGererListes({ administrateur: false, externe: false }, { toutVoir: false })).toBe(false);
    expect(L.peutGererListes({ administrateur: true, externe: true }, { toutVoir: false })).toBe(false);
  });
});
