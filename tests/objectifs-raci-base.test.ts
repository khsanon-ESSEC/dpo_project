/**
 * Objectifs, bénéfices, RACI et fiche de projet exportée, contre la base de démonstration (29 octobre 2026).
 * Le test remet la base dans l'état où il l'a trouvée.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as ObjModule from "@/lib/donnees/objectifs";
import type * as RaciModule from "@/lib/donnees/raci";
import type * as FicheModule from "@/lib/donnees/fiche-projet";
import type * as ClotureModule from "@/lib/donnees/cloture";
import type { Utilisateur } from "@/lib/auth/session";
import { RACI_DPO } from "@/lib/raci";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("objectifs, RACI et fiche de projet", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let O: typeof ObjModule;
  let R: typeof RaciModule;
  let F: typeof FicheModule;
  let C: typeof ClotureModule;
  const gens = new Map<string, Utilisateur>();
  const acces = (c: string) => A.acces(gens.get(c)!);
  let UR = "";
  let PR = "";
  let MS = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    O = await import("@/lib/donnees/objectifs");
    R = await import("@/lib/donnees/raci");
    F = await import("@/lib/donnees/fiche-projet");
    C = await import("@/lib/donnees/cloture");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    const code = async (c: string) => (await D.db.select({ id: D.schema.projets.id }).from(D.schema.projets).where(eq(D.schema.projets.code, c)))[0].id;
    UR = await code("UR");
    PR = await code("PR");
    MS = await code("MS");
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("objectifs : écrits par qui gère le projet, pas par un membre de l'équipe", async () => {
    expect(await O.ajouterObjectif(await acces("ricardo.etienne"), UR, "objectif", { libelle: "Un objectif de membre" })).toHaveProperty("erreur");
    const r = await O.ajouterObjectif(await acces("myriam.valcin"), UR, "benefice", { libelle: "Essai", indicateur: "Délai", depart: "3 j", cible: "1 j" });
    expect(r).toMatchObject({ ok: true });
    if (!("id" in r)) return;
    expect(await O.modifierObjectif(await acces("ricardo.etienne"), UR, r.id, { libelle: "Détourné" })).toHaveProperty("erreur");
    // Un identifiant d'un autre projet ne passe pas.
    expect(await O.modifierObjectif(await acces("daphnee.joseph"), PR, r.id, { libelle: "Ailleurs" })).toHaveProperty("erreur");
    expect(await O.noterConstat(await acces("ricardo.etienne"), UR, r.id, "2 j")).toHaveProperty("erreur");
    expect(await O.noterConstat(await acces("myriam.valcin"), UR, r.id, "2 j")).toEqual({ ok: true });
    expect(await O.retirerObjectif(await acces("myriam.valcin"), UR, r.id)).toEqual({ ok: true });
  });

  it("valeurs constatées : un historique daté (une par jour), la dernière recopiée sur le bénéfice (29 octobre 2026)", async () => {
    const mv = await acces("myriam.valcin");
    const r = await O.ajouterObjectif(mv, UR, "benefice", { libelle: "Délai de traitement", indicateur: "Délai moyen", depart: "24", cible: "12" });
    if (!("id" in r)) throw new Error("bénéfice");
    // Deux mesures passées (le seul moyen d'en avoir à des jours différents dans un test), puis celle du jour.
    await D.db.insert(D.schema.constatsBenefice).values([{ objectifId: r.id, valeur: "22", le: "2026-09-30" }, { objectifId: r.id, valeur: "20", le: "2026-10-15" }]);
    expect(await O.noterConstat(mv, UR, r.id, "18")).toEqual({ ok: true });
    // Corrigée le même jour : la mesure du jour est remplacée, pas ajoutée.
    expect(await O.noterConstat(mv, UR, r.id, "17")).toEqual({ ok: true });
    const h = (await O.constatsDesBenefices([r.id])).get(r.id)!;
    expect(h.map((x) => x.valeur)).toEqual(["22", "20", "17"]);
    const [b] = await D.db.select().from(D.schema.objectifsProjet).where(eq(D.schema.objectifsProjet.id, r.id));
    expect(b.constate).toBe("17");
    const { progression } = await import("@/lib/progression");
    expect(progression(b.depart, b.cible, h)).toMatchObject({ ecart: -3, base: "precedent", mieux: true, parcouru: 58 });
    // Vider la valeur retire la mesure du jour : la précédente redevient la dernière.
    expect(await O.noterConstat(mv, UR, r.id, "")).toEqual({ ok: true });
    const [b2] = await D.db.select().from(D.schema.objectifsProjet).where(eq(D.schema.objectifsProjet.id, r.id));
    expect(b2).toMatchObject({ constate: "20", constateLe: "2026-10-15" });
    expect(await O.retirerObjectif(mv, UR, r.id)).toEqual({ ok: true });
    expect((await O.constatsDesBenefices([r.id])).get(r.id)).toBeUndefined();
  });

  it("un projet archivé : objectifs figés, et pas de valeur constatée", async () => {
    const [b] = await D.db.select().from(D.schema.objectifsProjet).where(and(eq(D.schema.objectifsProjet.projetId, MS), eq(D.schema.objectifsProjet.genre, "benefice")));
    expect(await O.noterConstat(await acces("frantz.desrosiers"), MS, b.id, "1")).toHaveProperty("erreur");
    expect(await O.ajouterObjectif(await acces("frantz.desrosiers"), MS, "objectif", { libelle: "Encore un" })).toHaveProperty("erreur");
  });

  it("clôture : chaque objectif doit être évalué ; le bilan d'ensemble en est tiré", async () => {
    const dj = await acces("daphnee.joseph");
    const a1 = await O.ajouterObjectif(dj, PR, "objectif", { libelle: "Premier objectif du test" });
    const a2 = await O.ajouterObjectif(dj, PR, "objectif", { libelle: "Second objectif du test" });
    if (!("id" in a1) || !("id" in a2)) throw new Error("objectifs non créés");
    const base = { clotureLe: null, bilan: "Le projet est livré en grande partie.", objectifs: "", lecons: "" };
    expect(await C.cloturerProjet(dj, PR, { ...base, evaluations: { [a1.id]: "oui" } })).toMatchObject({ erreur: expect.stringMatching(/Second objectif du test/) });
    expect(await C.cloturerProjet(dj, PR, { ...base, evaluations: { [a1.id]: "oui", [a2.id]: "non" } })).toEqual({ ok: true });
    const [p] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, PR));
    expect(p).toMatchObject({ statut: "finalise", objectifsAtteints: "en_partie" });
    // Après la clôture : objectifs figés, valeur constatée encore possible pour un bénéfice.
    expect(await O.ajouterObjectif(dj, PR, "objectif", { libelle: "Trop tard" })).toHaveProperty("erreur");
    const [ben] = await D.db.insert(D.schema.objectifsProjet).values({ projetId: PR, genre: "benefice", ordre: 1, libelle: "Délai d'embauche", indicateur: "Jours", depart: "60", cible: "30" }).returning();
    expect(await O.noterConstat(dj, PR, ben.id, "35")).toEqual({ ok: true });
    // RACI du projet figé.
    expect(await R.enregistrerRaciProjet(dj, PR)).toHaveProperty("erreur");
    // Remise en état.
    expect(await C.rouvrirProjet(dj, PR)).toEqual({ ok: true });
    await D.db.delete(D.schema.objectifsProjet).where(eq(D.schema.objectifsProjet.projetId, PR));
    await D.db.update(D.schema.projets).set({ objectifsAtteints: "", bilanCloture: "" }).where(eq(D.schema.projets.id, PR));
  });

  it("RACI type : administrateurs et exécutifs seulement ; RACI du projet : qui gère le projet", async () => {
    expect(R.peutGererRaciType(await acces("myriam.valcin"))).toBe(false);
    expect(await R.enregistrerRaciType(await acces("myriam.valcin"), RACI_DPO)).toHaveProperty("erreur");
    expect(R.peutGererRaciType(await acces("jean-robert.noel"))).toBe(true);
    const modifie = { ...RACI_DPO, lignes: [...RACI_DPO.lignes, { activite: "Tester", lettres: ["I", "A", "R"] }] };
    expect(await R.enregistrerRaciType(await acces("frantz.desrosiers"), JSON.stringify(modifie))).toMatchObject({ ok: true });
    expect((await R.raciType()).lignes).toHaveLength(6);
    expect(await R.enregistrerRaciProjet(await acces("ricardo.etienne"), UR)).toHaveProperty("erreur");
    expect(await R.enregistrerRaciProjet(await acces("myriam.valcin"), UR)).toMatchObject({ ok: true });
    expect(await R.raciDuProjet(UR)).toMatchObject({ propre: true });
    expect(await R.revenirAuRaciType(await acces("ricardo.etienne"), UR)).toHaveProperty("erreur");
    expect(await R.revenirAuRaciType(await acces("myriam.valcin"), UR)).toEqual({ ok: true });
    expect(await R.raciDuProjet(UR)).toMatchObject({ propre: false });
    await R.enregistrerRaciType(await acces("frantz.desrosiers"), RACI_DPO);
  });

  it("fiche exportée : le budget pour qui gère le projet, pas pour un membre", async () => {
    const chef = await F.ficheAExporter(await acces("myriam.valcin"), UR);
    const membre = await F.ficheAExporter(await acces("ricardo.etienne"), UR);
    expect(chef?.budget).not.toBeNull();
    expect(membre?.budget).toBeNull();
    expect(chef?.objectifs.length).toBe(3);
    expect(chef?.raci.lignes.length).toBe(5);
    expect(chef?.nomsRaci[0]).toBe("Frantz Desrosiers");
    expect((await O.objectifsDesProjets([UR, PR])).get(UR)).toHaveLength(3);
  });

  it("une demande garde ses objectifs", async () => {
    const [p] = await D.db.insert(D.schema.projets).values({ code: "ZT", titre: "Demande de test", statut: "requete" }).returning();
    expect(await O.objectifsDeLaDemande(p.id, "- Un\n- Deux objectifs\n- Trois objectifs")).toBe(2);
    await D.db.delete(D.schema.projets).where(eq(D.schema.projets.id, p.id));
  });
});
