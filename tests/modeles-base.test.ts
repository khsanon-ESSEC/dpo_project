/**
 * Modèles de rapport et rapport de chef, contre la base de démonstration (voir tests/preparer-base.ts).
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as RapportModule from "@/lib/donnees/rapport";
import type * as ModelesModule from "@/lib/donnees/modeles";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("modèles de rapport et rapport de chef", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let R: typeof RapportModule;
  let M: typeof ModelesModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    R = await import("@/lib/donnees/rapport");
    M = await import("@/lib/donnees/modeles");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  const rapportDe = async (courriel: string) => {
    const [r] = await D.db
      .select()
      .from(D.schema.rapportsHebdo)
      .where(and(eq(D.schema.rapportsHebdo.auteurId, qui(courriel).id), eq(D.schema.rapportsHebdo.semaine, R.semaineCourante())));
    return r;
  };

  it("chacun reçoit le modèle prévu : équipe, chef d'équipe, affectation nominative, défaut", async () => {
    const dj = await M.formulairePour(qui("daphnee.joseph").id);
    expect(dj.modele?.nom).toBe("Solutions technologiques");
    expect(dj.champs.map((c) => c.id)).toEqual(["fait", "en_cours", "bloque", "sante", "prochaine", "charge", "decision"]);
    const ml = await M.formulairePour(qui("marc-antoine.louis").id);
    expect(ml.modele?.nom).toBe("Rapport de chef d'équipe");
    expect(ml.champs.filter((c) => c.partie === "travail" && c.type !== "intertitre").map((c) => c.id)).toEqual(dj.champs.map((c) => c.id));
    expect(ml.champs.filter((c) => c.type === "reprise").length).toBe(5);
    const na = await M.formulairePour(qui("nadege.augustin").id);
    expect(na.modele?.nom).toBe("Rapport de la division");
    expect(na.champs.some((c) => c.partie === "travail" && c.type === "charge")).toBe(false); // son équipe a le modèle par défaut
    expect((await M.formulairePour(qui("fabienne.michel").id)).modele?.nom).toBe("Rapport du vendredi");
  });

  it("le brouillon individuel est préparé : lignes, un feu par projet, charge proposée", async () => {
    const r = await R.obtenirOuCreerRapport(qui("daphnee.joseph").id);
    const [lignes, reponses] = await Promise.all([R.lignesDuRapport(r.id), R.reponsesDuRapport(r.id)]);
    expect(lignes.filter((l) => l.champId === "fait").length).toBe(3);
    expect(reponses.filter((x) => x.champId === "sante").map((x) => x.projetCode).sort()).toEqual(["PR", "UN", "UR"]);
    const charge = reponses.find((x) => x.champId === "charge");
    expect(charge?.propose).toBeTruthy();
    expect(charge?.valeur).toBe(charge?.propose);
  });

  it("le rapport de chef reprend l'équipe ; ce qui est réservé au chef reste à lui", async () => {
    const r = await R.obtenirOuCreerRapport(qui("marc-antoine.louis").id);
    await R.synchroniserReprises(r);
    const lignes = await R.lignesDuRapport(r.id);
    const aDecider = lignes.filter((l) => l.champId === "a_decider");
    expect(aDecider.map((l) => l.texte)).toContain("Serveur de recette demandé à la DTI lundi");
    const decision = aDecider.find((l) => l.texte.startsWith("Valider le report de la recette Credos"));
    expect(decision?.visibilite).toBe("auteur"); // champ « supérieur seulement » chez Ludovic
    expect(lignes.filter((l) => l.champId === "fait_equipe").length).toBe(4);
    // Une deuxième synchronisation n'ajoute rien.
    expect(await R.synchroniserReprises(r)).toBe(0);
    const v = await R.vueEquipe(r);
    const cr = v.sante.get("sante_equipe")!.find((p) => p.code === "CR")!;
    expect(cr.propose).toBe("en_retard"); // le plus préoccupant : Ludovic
    expect(v.charge.membres.length).toBe(6);
  });

  it("un champ obligatoire vide bloque l'envoi", async () => {
    const r = await R.obtenirOuCreerRapport(qui("marc-antoine.louis").id);
    const res = await R.envoyerRapport(r.id, qui("marc-antoine.louis").id);
    expect(res && !res.ok && res.manquants).toEqual(["Fait"]);
  });

  it("lecture champ par champ : la direction ne voit pas ce qui est réservé au supérieur", async () => {
    const lp = await rapportDe("ludovic.pierre");
    const parMl = await R.lireRapport(await A.acces(qui("marc-antoine.louis")), lp.id);
    expect(parMl?.lecteur).toBe("superieur");
    expect(parMl?.formulaire.map((c) => c.id)).toContain("decision");
    const parNa = await R.lireRapport(await A.acces(qui("nadege.augustin")), lp.id);
    expect(parNa?.lecteur).toBe("direction");
    expect(parNa?.formulaire.map((c) => c.id)).not.toContain("charge");
    expect(parNa?.caches).toEqual(["Ma charge", "Décision ou aide attendue"]);
    expect(parNa?.reponses.some((x) => x.champId === "decision")).toBe(false);
  });

  it("le chef de projet ne lit que les lignes et les feux de son projet", async () => {
    const re = await rapportDe("ricardo.etienne");
    const lu = await R.lireRapport(await A.acces(qui("myriam.valcin")), re.id);
    expect(lu?.lecteur).toBe("chef_projet");
    expect(lu?.lignes.every((l) => l.projetCode === "UR")).toBe(true);
    expect(lu?.reponses.map((x) => x.projetCode)).toEqual(["UR"]);
    expect(lu?.formulaire.some((c) => c.type === "charge")).toBe(false);
  });

  it("niveau division : seul ce que le chef fait remonter arrive en tête", async () => {
    const r = await R.obtenirOuCreerRapport(qui("nadege.augustin").id);
    await R.synchroniserReprises(r);
    const aDecider = (await R.lignesDuRapport(r.id)).filter((l) => l.champId === "a_decider").map((l) => l.texte);
    expect(aDecider).toContain("Scanner du 3e étage en panne depuis mercredi"); // remonté par Myriam
    expect(aDecider.some((t) => t.startsWith("Validation de la procédure"))).toBe(true); // sans chef d'équipe
  });

  it("la fiche projet ne répète pas les reprises d'un rapport de chef", async () => {
    const g = await R.lignesDuProjetCetteSemaine(projets.get("AE")!, "toutes");
    expect(g.map((x) => x.prenom).sort()).toEqual(["Fabienne", "Joël"]);
  });

  it("éditer un modèle prépare une version ; la publier archive la précédente", async () => {
    const jn = qui("jean-robert.noel");
    const [st] = await D.db.select().from(D.schema.modelesRapport).where(eq(D.schema.modelesRapport.nom, "Solutions technologiques"));
    const e = (await M.champsEnEdition(st.id))!;
    expect((await M.enregistrerChamps(st.id, [...e.champs, { id: "fait", type: "texte", libelle: "Doublon" }], jn.id)).ok).toBe(false);
    const v = await M.enregistrerChamps(st.id, [...e.champs, { id: "moral", type: "echelle", libelle: "Moral", options: ["1", "2", "3"] }], jn.id);
    expect(v.ok).toBe(true);
    const p = await M.publierBrouillon(st.id, "Ajoute « Moral ».", jn.id);
    expect("numero" in p && p.numero).toBe(3);
    const versions = await D.db.select().from(D.schema.versionsModele).where(eq(D.schema.versionsModele.modeleId, st.id));
    expect(versions.filter((x) => x.statut === "publiee").map((x) => x.numero)).toEqual([3]);
    // Un rapport déjà commencé garde son formulaire.
    const dj = await R.obtenirOuCreerRapport(qui("daphnee.joseph").id);
    expect(R.formulaireDe(dj).some((c) => c.id === "moral")).toBe(false);
  });
});
