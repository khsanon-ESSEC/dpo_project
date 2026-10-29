/**
 * Kit de démarrage, contre la base de démonstration (29 octobre 2026) : la fiche remplie à la création, le kit
 * proposé, puis ajouté (ce qui est coché seulement), et ce qui n'est plus proposé ensuite.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as KitModule from "@/lib/donnees/kit";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("kit de démarrage", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let K: typeof KitModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const acces = (courriel: string) => A.acces(qui(courriel));
  const projet = async (id: string) => (await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, id)))[0];
  const crees: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    K = await import("@/lib/donnees/kit");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
  });

  afterAll(async () => {
    // La base reste comme avant pour les autres fichiers de tests.
    for (const id of crees) await D.db.delete(D.schema.projets).where(eq(D.schema.projets.id, id));
    await globalThis.__pgClient?.end();
  });

  const creer = async (titre: string, cadrage: Parameters<typeof G.proposerProjet>[0]["cadrage"]) => {
    const r = await G.proposerProjet(
      { titre, description: "", justification: "Utile à la banque.", programme: "", strategique: false, finSouhaitee: "2027-04-30", chefSuggereId: qui("myriam.valcin").id, code: "", cadrage },
      qui("frantz.desrosiers").id,
      { statut: "en_cours", dateEntree: "2026-11-02" },
    );
    const id = (r as { id: string }).id;
    crees.push(id);
    return id;
  };

  it("la fiche se garde à la création ; les projets de la démonstration ont déjà leur kit, pas la demande TD", async () => {
    const id = await creer("Délais des dossiers de crédit", { types: ["amelioration_processus"], infos: ["techniques", "organisationnelles"], specialisations: ["solutions", "deploiement"] });
    const p = await projet(id);
    expect(p.cadrage).toEqual({ types: ["amelioration_processus"], infos: ["techniques", "organisationnelles"], specialisations: ["solutions", "deploiement"] });
    expect(p.kitLe).toBeNull();
    const [ur] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "UR"));
    const [td] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "TD"));
    expect(ur.kitLe).not.toBeNull();
    expect(td.kitLe).toBeNull();
    expect(td.cadrage).toMatchObject({ specialisations: ["solutions", "deploiement"] });
  });

  it("un membre de l'équipe ne l'utilise pas ; la cheffe de projet ajoute ce qu'elle a coché, et rien d'autre", async () => {
    const id = crees[0];
    const kit = await K.kitDuProjet(await projet(id));
    expect(kit.phases).toHaveLength(6);
    expect(kit.livrables.map((x) => x.cle)).toEqual(expect.arrayContaining(["budget", "processus-actuel", "cahier-charges", "formes"]));
    // La personne de l'équipe « Solutions technologiques » est proposée.
    expect(kit.personnes.map((x) => x.role)).toContain("Solutions technologiques");
    expect(await K.appliquerKit(await acces("ricardo.etienne"), id, new Set(["phases"]))).toHaveProperty("erreur");

    const choisis = new Set(["phases", "cahier-charges", "budget", "formes", "r-fournisseur", "r-budget", "b-delai", ...kit.personnes.map((x) => x.cle)]);
    const r = await K.appliquerKit(await acces("frantz.desrosiers"), id, choisis);
    expect(r).toEqual({ ok: true, bilan: { phases: 6, livrables: 3, risques: 2, benefices: 1, personnes: kit.personnes.length } });

    const phases = await D.db.select().from(D.schema.phasesProjet).where(eq(D.schema.phasesProjet.projetId, id)).orderBy(asc(D.schema.phasesProjet.ordre));
    expect(phases.map((x) => x.nom)).toEqual(["Cadrage", "Conception", "Réalisation", "Validation métier", "Déploiement", "Clôture"]);
    const livrables = await D.db.select().from(D.schema.indicateurs).where(eq(D.schema.indicateurs.projetId, id)).orderBy(asc(D.schema.indicateurs.ordre));
    expect(livrables.map((x) => x.libelle)).toEqual(["Budget estimé et approuvé", "Cahier des charges validé", "Utilisateurs formés"]);
    // Chaque livrable : sa phase, sa date (la fin de la phase), la cheffe de projet comme responsable, son critère.
    const cdc = livrables[1];
    const conception = phases.find((x) => x.nom === "Conception")!;
    expect(cdc).toMatchObject({ phaseId: conception.id, prevuLe: conception.fin, responsableId: qui("myriam.valcin").id, critere: "validé par le métier et la DTI", etat: "a_venir" });
    const risques = await D.db.select().from(D.schema.risquesProjet).where(eq(D.schema.risquesProjet.projetId, id));
    expect(risques.map((x) => x.titre).sort()).toEqual(["Coût non estimé : le budget ne suffit pas", "Le prestataire ou la DTI ne livre pas à temps"]);
    expect(risques.every((x) => x.responsableId === qui("myriam.valcin").id && x.auteurId === qui("frantz.desrosiers").id && x.statut === "ouvert")).toBe(true);
    const benefices = await D.db.select().from(D.schema.objectifsProjet).where(and(eq(D.schema.objectifsProjet.projetId, id), eq(D.schema.objectifsProjet.genre, "benefice")));
    expect(benefices).toEqual([expect.objectContaining({ libelle: "Réduction du délai de traitement", indicateur: "Délai moyen de traitement", depart: "", cible: "" })]);
    expect((await projet(id)).kitLe).not.toBeNull();
    // La cheffe de projet reçoit une seule alerte pour tout le kit.
    const alertes = await D.db.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.personneId, qui("myriam.valcin").id), eq(D.schema.notifications.lien, `/projets/${id}#livrables`)));
    expect(alertes).toHaveLength(1);
    expect(alertes[0].texte).toMatch(/3 livrables et 2 risques vous sont confiés/);

    // Ensuite : le kit ne repropose ni les phases, ni ce qui a été ajouté ; le reste reste disponible.
    const apres = await K.kitDuProjet(await projet(id));
    expect(apres.phases).toEqual([]);
    expect(apres.livrables.map((x) => x.cle)).not.toContain("cahier-charges");
    expect(apres.livrables.map((x) => x.cle)).toContain("processus-actuel");
    expect(apres.livrables.find((x) => x.cle === "processus-actuel")!.prevuLe).toBe(conception.fin);
    expect(apres.personnes).toEqual([]);
  });

  it("« Ne pas utiliser le kit » : la fiche ne le propose plus ; pas de kit pour une demande", async () => {
    const id = await creer("Signature électronique des contrats", null);
    expect(await K.ecarterKit(await acces("myriam.valcin"), id)).toEqual({ ok: true });
    expect((await projet(id)).kitLe).not.toBeNull();
    const [td] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.code, "TD"));
    expect(await K.appliquerKit(await acces("frantz.desrosiers"), td.id, new Set(["phases"]))).toEqual({ erreur: "Le kit de démarrage sert aux projets acceptés et en cours." });
  });
});
