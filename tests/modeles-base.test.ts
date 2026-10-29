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
import type * as ConseilModule from "@/lib/donnees/conseil";
import type * as PiecesModule from "@/lib/donnees/pieces";
import type * as RappelsModule from "@/lib/donnees/rappels";
import type * as EquipeModule from "@/lib/donnees/equipe";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("modèles de rapport et rapport de chef", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let R: typeof RapportModule;
  let M: typeof ModelesModule;
  let C: typeof ConseilModule;
  let PJ: typeof PiecesModule;
  let RA: typeof RappelsModule;
  let EQ: typeof EquipeModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (courriel: string) => gens.get(courriel)!;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    R = await import("@/lib/donnees/rapport");
    M = await import("@/lib/donnees/modeles");
    C = await import("@/lib/donnees/conseil");
    PJ = await import("@/lib/donnees/pieces");
    RA = await import("@/lib/donnees/rappels");
    EQ = await import("@/lib/donnees/equipe");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
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
    expect(dj.champs.map((c) => c.id)).toEqual(["fait", "en_cours", "bloque", "sante", "prochaine", "charge", "decision", "reunions", "pieces"]);
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
    expect(aDecider.map((l) => l.texte)).toContain("Serveur de test demandé à la DTI lundi");
    const decision = aDecider.find((l) => l.texte.startsWith("Valider le report de la validation métier de Credos"));
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
    expect(parNa?.caches).toEqual(["Ma charge", "Décision ou aide attendue", "Mes réunions de la semaine"]);
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

  it("la synthèse par projet ne reprend que ce que ses lecteurs pouvaient déjà lire", async () => {
    const r = await R.obtenirOuCreerRapport(qui("marc-antoine.louis").id);
    const syntheses = await R.synchroniserSyntheses(r);
    const cr = syntheses.get("synthese")!.find((m) => m.code === "CR")!;
    const textes = cr.elements.map((e) => e.texte);
    expect(textes).toContain("Serveur de test demandé à la DTI lundi");
    expect(textes.some((t) => t.startsWith("Valider le report"))).toBe(false); // champ « supérieur seulement » de Ludovic
    const rep = (await R.reponsesDuRapport(r.id)).find((x) => x.champId === "synthese" && x.projetCode === "CR")!;
    expect(rep.valeur).toBe(rep.propose);
    expect(rep.valeur).toContain("À décider ou débloquer : Serveur de test demandé à la DTI lundi");
    // Niveau division : la synthèse de Myriam est reprise telle quelle.
    const na = await R.obtenirOuCreerRapport(qui("nadege.augustin").id);
    const ae = (await R.synchroniserSyntheses(na)).get("synthese")!.find((m) => m.code === "AE")!;
    expect(ae.recues.map((x) => x.qui)).toEqual(["Myriam"]);
  });

  it("compléter le brouillon : une tâche terminée depuis passe dans « Fait »", async () => {
    const r = await R.obtenirOuCreerRapport(qui("daphnee.joseph").id);
    const enCours = (await R.lignesDuRapport(r.id)).find((l) => l.champId === "en_cours" && l.tacheId)!;
    await D.db.update(D.schema.taches).set({ statut: "faite", termineeLe: new Date("2026-10-29T15:00:00-04:00") }).where(eq(D.schema.taches.id, enCours.tacheId!));
    const [frais] = await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, r.id));
    expect(await R.completerBrouillon(frais)).toBeGreaterThan(0);
    const apres = (await R.lignesDuRapport(r.id)).find((l) => l.id === enCours.id)!;
    expect(apres.champId).toBe("fait");
    expect(apres.texte).toBe(enCours.texte); // son texte est gardé
    // Une deuxième fois ne change rien.
    const [encore] = await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, r.id));
    expect(await R.completerBrouillon(encore)).toBe(0);
  });

  it("une pièce jointe se lit selon le champ : supérieur et direction oui, collègue et chef de projet non", async () => {
    const lp = await rapportDe("ludovic.pierre");
    const [piece] = await PJ.piecesDuRapport(lp.id);
    expect(piece.nom).toBe("Demande-serveur-test-Credos.pdf");
    expect((await PJ.lirePiece(await A.acces(qui("marc-antoine.louis")), piece.id))?.contenu.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await PJ.lirePiece(await A.acces(qui("nadege.augustin")), piece.id)).not.toBeNull();
    expect(await PJ.lirePiece(await A.acces(qui("daphnee.joseph")), piece.id)).toBeNull();
    expect(await PJ.lirePiece(await A.acces(qui("wesner.bazile")), piece.id)).toBeNull(); // chef du projet CR
  });

  it("rapport ponctuel : seulement des projets visibles ; listé pour la direction", async () => {
    const ml = qui("marc-antoine.louis");
    const visibles = await A.idsProjetsVisibles(await A.acces(ml));
    const r = await C.creerRapportPonctuel({ titre: "Demande du comité des risques", objet: "État des projets en ligne", depuis: "2026-10-01", projetIds: [projets.get("UC")!, projets.get("AE")!] }, ml.id, visibles);
    expect("id" in r).toBe(true);
    if (!("id" in r)) return;
    const lignes = await C.lignesConseil(r.id, "brouillon");
    expect(lignes.map((l) => l.projet.code)).toEqual(["UC"]); // AE n'est pas dans sa direction
    expect(lignes[0].ligne.etatAvancement).toContain("Depuis le 1er oct.");
    const vus = await C.rapportsPonctuels(await A.idsProjetsVisibles(await A.acces(qui("nadege.augustin"))), qui("nadege.augustin").id);
    expect(vus.map((x) => x.titre)).toEqual(expect.arrayContaining(["Demande du comité des risques", "Point de situation après la panne du réseau du 21 octobre"]));
    expect((await C.creerRapportPonctuel({ titre: "", objet: "", depuis: "", projetIds: [] }, ml.id, visibles)).hasOwnProperty("erreur")).toBe(true);
  });

  it("heures du rapport : une alerte « prêt à relire » par semaine ; rien pour un exécutif", async () => {
    const sc = qui("sophonie.charles");
    await RA.rappelsDuMoment(sc.id);
    await RA.rappelsDuMoment(sc.id);
    const n = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, sc.id), eq(D.schema.notifications.type, "rapport_pret")));
    expect(n.length).toBe(1);
    const ex = qui("frantz.desrosiers");
    await RA.rappelsDuMoment(ex.id, false);
    const nx = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, ex.id), eq(D.schema.notifications.type, "rapport_pret")));
    expect(nx.length).toBe(0);
  });

  it("Équipe : un directeur voit toute la structure sous lui, par équipe", async () => {
    const na = await EQ.monEquipe(await A.acces(qui("nadege.augustin")));
    expect(na.groupes.map((g) => [g.titre, g.personnes.length])).toEqual([
      ["Avec vous", 4],
      ["Équipe de Marc-Antoine Louis", 6],
      ["Équipe de Myriam Valcin", 2],
    ]);
    expect(na.aRelancer.every((p) => p.direct)).toBe(true);
    const mv = await EQ.monEquipe(await A.acces(qui("myriam.valcin")));
    expect(mv.groupes.map((g) => g.titre)).toEqual(["Avec vous"]);
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
