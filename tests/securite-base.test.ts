/**
 * Contrôles d'accès issus de la revue de sécurité, contre la base de démonstration.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as GestionModule from "@/lib/donnees/gestion";
import type * as OrganisationModule from "@/lib/donnees/organisation";
import { peutGererProjet } from "@/lib/projets";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("revue de sécurité : contrôles d'accès", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let G: typeof GestionModule;
  let O: typeof OrganisationModule;
  const gens = new Map<string, Utilisateur>();
  const projets = new Map<string, string>();
  const qui = (cle: string) => gens.get(cle)!;
  const acces = (cle: string) => A.acces(qui(cle));
  const base = { description: "", echeance: null, debut: null, estimationHeures: null };
  const acteurDe = (a: Awaited<ReturnType<typeof acces>>) => ({ moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    G = await import("@/lib/donnees/gestion");
    O = await import("@/lib/donnees/organisation");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      const cle = p.courriel ? p.courriel.split("@")[0] : `${p.prenom}.${p.nom}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      gens.set(cle, { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    for (const p of await D.db.select({ id: D.schema.projets.id, code: D.schema.projets.code }).from(D.schema.projets)) projets.set(p.code, p.id);
  });

  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  it("un directeur voit le projet d'une autre direction où travaillent les siens, mais ne le gère pas", async () => {
    const ml = await acces("marc-antoine.louis");
    const ur = projets.get("UR")!; // dirigé par Myriam Valcin, hors de la direction de Marc-Antoine
    const visibles = await A.idsProjetsVisibles(ml);
    expect(visibles !== "tous" && visibles.has(ur)).toBe(true);
    const [p] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, ur));
    expect(peutGererProjet(acteurDe(ml), p)).toBe(false);
    // Un projet de sa direction (CE, Wesner Bazile) : oui. La directrice de la division : UR aussi.
    const [ce] = await D.db.select().from(D.schema.projets).where(eq(D.schema.projets.id, projets.get("CE")!));
    expect(peutGererProjet(acteurDe(ml), ce)).toBe(true);
    expect(peutGererProjet(acteurDe(await acces("nadege.augustin")), p)).toBe(true);
  });

  it("le chef hors division d'un projet d'une autre division ne le dirige pas ici, même avec un accès", async () => {
    const ms = await acces("mireille.saint-fort");
    expect(ms.projetsDiriges.has(projets.get("OC")!)).toBe(false);
    expect(A.auteursLignesVisibles(ms, projets.get("OC")!)).toBeNull();
    expect((await acces("wesner.bazile")).projetsDiriges.has(projets.get("OC")!)).toBe(true);
  });

  it("une consultante avec un accès limité ne voit que les personnes avec qui elle travaille", async () => {
    const nc = await acces("nathalie.celestin");
    expect(nc.projetsDiriges.size).toBe(0);
    expect(nc.toutVoir || nc.directeur).toBe(false);
    const contacts = await A.contactsVisibles(nc);
    expect(contacts.has(qui("myriam.valcin").id)).toBe(true); // cheffe de son projet
    expect(contacts.has(qui("marc-antoine.louis").id)).toBe(true); // participant d'une de ses réunions
    expect(contacts.has(qui("frantz.desrosiers").id)).toBe(false);
    expect(contacts.has(qui("ludovic.pierre").id)).toBe(false);
    const internes = [...gens.values()].filter((p) => !p.externe).length;
    expect(contacts.size).toBeLessThan(internes);
  });

  it("une consultante ne confie de tâche qu'à elle-même et ne crée pas de fiche hors division", async () => {
    const nc = await acces("nathalie.celestin");
    const { personnes, externes } = await G.assignables(nc);
    expect(personnes.map((p) => p.id)).toEqual([nc.moi.id]);
    expect(externes).toEqual([]);
    expect(await G.creerTacheGeree(nc, { ...base, titre: "Pour Myriam", projetId: null, assigneId: qui("myriam.valcin").id })).toHaveProperty("erreur");
    expect(await G.creerTacheGeree(nc, { ...base, titre: "Nouvelle fiche", projetId: null, assigneId: "", nouvelExterne: { nom: "Quelqu'un Dehors", organisation: "Cabinet" } })).toHaveProperty("erreur");
    expect(await G.creerTacheGeree(nc, { ...base, titre: "Relire mon rapport de contre-audit", projetId: null, assigneId: nc.moi.id })).toHaveProperty("id");
  });

  it("une tâche annulée n'ouvre plus le projet à son ancien titulaire", async () => {
    const mv = await acces("myriam.valcin");
    const ur = projets.get("UR")!;
    const fm = qui("fabienne.michel");
    const r = (await G.creerTacheGeree(mv, { ...base, titre: "Tâche annulée ensuite", projetId: ur, assigneId: fm.id })) as { id: string };
    expect(r).toHaveProperty("id");
    const vis = async () => {
      const v = await A.idsProjetsVisibles(await A.acces({ ...fm }));
      return v === "tous" || v.has(ur);
    };
    expect(await vis()).toBe(true);
    const [t] = await D.db.select().from(D.schema.taches).where(eq(D.schema.taches.id, r.id));
    await G.annulerTache(mv, t, "Confiée par erreur.");
    const membre = (await G.membresDuProjet(ur)).find((m) => m.personneId === fm.id)!;
    await G.retirerMembre(ur, membre.id, mv.moi.id);
    expect(await vis()).toBe(false);
  });

  it("une fiche hors division ne reçoit ni rôle interne ni place dans la hiérarchie", async () => {
    const na = qui("nadege.augustin").id;
    const modif = { equipeId: null, superieurId: null, poste: "", directeur: true, executif: false, administrateur: false, capaciteHeures: 40, actif: true };
    await expect(O.modifierPersonne(na, qui("nathalie.celestin").id, modif)).rejects.toThrow(/hors division/);
    const [dj] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.id, qui("daphnee.joseph").id));
    await expect(
      O.modifierPersonne(na, dj.id, { equipeId: dj.equipeId, superieurId: qui("patrick.dorsainvil").id, poste: dj.poste, directeur: false, executif: false, administrateur: false, capaciteHeures: dj.capaciteHeures, actif: true }),
    ).rejects.toThrow(/supérieur/);
    const [apres] = await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.id, dj.id));
    expect(apres.superieurId).toBe(dj.superieurId);
  });
});
