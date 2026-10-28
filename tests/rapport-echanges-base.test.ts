/**
 * Lecture d'un rapport envoyé contre la base de démonstration : « Lu par » (le destinataire seulement),
 * « Répondre » (l'auteur et ceux qui le lisent en entier, avec une alerte), envoyé à l'heure, rapport précédent ;
 * un blocage marqué « Résolu » reste où il est quand la tâche est débloquée.
 * Lancer avec TEST_DATABASE_URL=postgres://… npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as RapportModule from "@/lib/donnees/rapport";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("rapport envoyé : lu par, répondre (base de démonstration)", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let R: typeof RapportModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (cle: string) => gens.get(cle)!;
  let rapport: typeof DbModule.schema.rapportsHebdo.$inferSelect;
  const alertes = async (cle: string) =>
    D.db
      .select()
      .from(D.schema.notifications)
      .where(and(eq(D.schema.notifications.personneId, qui(cle).id), eq(D.schema.notifications.type, "rapport_message")));

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    A = await import("@/lib/acces");
    R = await import("@/lib/donnees/rapport");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      if (!p.courriel) continue;
      gens.set(p.courriel.split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
    [rapport] = await D.db
      .select()
      .from(D.schema.rapportsHebdo)
      .where(and(eq(D.schema.rapportsHebdo.auteurId, qui("ludovic.pierre").id), eq(D.schema.rapportsHebdo.semaine, R.semaineCourante())));
  });
  afterAll(async () => {
    await globalThis.__pgClient?.end();
  });

  const relire = async () => (await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, rapport.id)))[0];

  it("« Lu par » : seule l'ouverture par le destinataire compte", async () => {
    await R.noterLecture(await A.acces(qui("nadege.augustin")), rapport);
    await R.noterLecture(await A.acces(qui("ludovic.pierre")), rapport);
    expect((await relire()).luLe).toBeNull();
    await R.noterLecture(await A.acces(qui("marc-antoine.louis")), rapport);
    const r = await relire();
    expect(r.luPar).toBe(qui("marc-antoine.louis").id);
    const premiere = r.luLe;
    await R.noterLecture(await A.acces(qui("marc-antoine.louis")), r);
    expect((await relire()).luLe).toEqual(premiere);
  });

  it("envoyé avant l'heure limite du modèle (vendredi 16 h)", async () => {
    expect(await R.envoyeALHeure(rapport)).toBe(true);
    expect(await R.envoyeALHeure({ ...rapport, envoyeLe: new Date("2026-10-30T22:00:00Z") })).toBe(false);
  });

  it("le rapport précédent, pour comparer, tel que le supérieur le lit", async () => {
    const p = await R.rapportPrecedentLisible(await A.acces(qui("marc-antoine.louis")), rapport);
    expect(p?.rapport.semaine).toBe("2026-10-19");
    expect(p?.complet).toBe(true);
    expect(await R.rapportPrecedentLisible(await A.acces(qui("ricardo.etienne")), rapport)).toBeNull();
  });

  it("le supérieur répond : l'auteur reçoit une alerte, pas lui", async () => {
    const r = await R.ecrireMessage(await A.acces(qui("marc-antoine.louis")), rapport.id, "  Licence validée, la recette peut commencer.  ");
    expect(r).toEqual({ ok: true });
    const m = await R.messagesDuRapport(rapport.id);
    expect(m.map((x) => x.texte)).toEqual(["Licence validée, la recette peut commencer."]);
    expect((await alertes("ludovic.pierre")).map((a) => a.lien)).toEqual([`/rapports/${rapport.id}#reponses`]);
    expect(await alertes("marc-antoine.louis")).toHaveLength(0);
  });

  it("l'auteur répond à son tour : le supérieur reçoit une alerte, une seule", async () => {
    expect(await R.ecrireMessage(await A.acces(qui("ludovic.pierre")), rapport.id, "Merci, je lance lundi.")).toEqual({ ok: true });
    expect(await alertes("marc-antoine.louis")).toHaveLength(1);
    expect(await alertes("ludovic.pierre")).toHaveLength(1);
  });

  it("un collègue qui ne lit pas ce rapport ne peut pas répondre ; un texte vide est refusé", async () => {
    expect((await R.ecrireMessage(await A.acces(qui("ricardo.etienne")), rapport.id, "Bonjour")).ok).toBe(false);
    expect((await R.ecrireMessage(await A.acces(qui("marc-antoine.louis")), rapport.id, "   ")).ok).toBe(false);
    expect((await R.ecrireMessage(await A.acces(qui("marc-antoine.louis")), "00000000-0000-0000-0000-000000000000", "Bonjour")).ok).toBe(false);
    // Un chef de projet qui ne lit que ses lignes ne répond pas au rapport entier.
    const lignes = await R.lignesDuRapport(rapport.id);
    for (const id of new Set(lignes.map((l) => l.projetChefId).filter((x): x is string => !!x))) {
      const cle = [...gens.entries()].find(([, g]) => g.id === id)?.[0];
      if (!cle) continue;
      const a = await A.acces(qui(cle));
      const lu = await R.lireRapport(a, rapport.id);
      if (lu?.lecteur !== "chef_projet") continue;
      expect((await R.ecrireMessage(a, rapport.id, "Bonjour")).ok).toBe(false);
    }
    expect(await R.messagesDuRapport(rapport.id)).toHaveLength(2);
  });

  it("la direction lit le rapport mais n'entre pas dans l'échange entre l'auteur et son supérieur", async () => {
    const a = await A.acces(qui("nadege.augustin"));
    expect((await R.lireRapport(a, rapport.id))?.lecteur).toBe("direction");
    expect((await R.ecrireMessage(a, rapport.id, "Bonjour")).ok).toBe(false);
    expect(R.peutEchanger("direction")).toBe(false);
  });

  it("une ligne reconduite ne passe pas dans un champ plus ouvert que le sien", () => {
    const f = [
      { id: "ouvert", type: "lignes", libelle: "Bloqué", rubrique: "bloque" },
      { id: "reserve", type: "lignes", libelle: "Bloqué (supérieur)", rubrique: "bloque", visibilite: "superieur" },
    ] as Parameters<typeof R.champPourReprise>[0];
    const avant = [{ id: "ancien", type: "lignes", libelle: "Bloqué", rubrique: "bloque", visibilite: "superieur" }] as Parameters<typeof R.champPourReprise>[0];
    expect(R.champPourReprise(f, { champId: "ancien" }, "bloque", avant)?.id).toBe("reserve");
    expect(R.champPourReprise(f, { champId: "ouvert" }, "bloque", f)?.id).toBe("ouvert");
    expect(R.champPourReprise([f[0]], { champId: "ancien" }, "bloque", avant)).toBeUndefined();
    // Une ligne qui porte sa propre visibilité la garde : n'importe quel champ de la rubrique convient.
    expect(R.champPourReprise([f[0]], { champId: "ancien", visibilite: "auteur" }, "bloque", avant)?.id).toBe("ouvert");
  });

  it("un mot trop long est coupé à 1000 caractères", async () => {
    await R.ecrireMessage(await A.acces(qui("marc-antoine.louis")), rapport.id, "x".repeat(1500));
    const m = await R.messagesDuRapport(rapport.id);
    expect(m.at(-1)?.texte.length).toBe(1000);
  });

  it("un blocage marqué « Résolu » reste où il est ; la tâche débloquée a sa propre ligne", async () => {
    const dj = qui("daphnee.joseph");
    const brouillon = await R.obtenirOuCreerRapport(dj.id, R.semaineCourante());
    await R.completerBrouillon(brouillon, { marquer: false });
    const [t] = await D.db.select().from(D.schema.taches).where(and(eq(D.schema.taches.assigneId, dj.id), eq(D.schema.taches.titre, "Accès de test DTI")));
    const avant = (await R.lignesDuRapport(brouillon.id)).find((l) => l.tacheId === t.id && l.partie === "bloque")!;
    // Bloquée depuis la semaine dernière : la ligne garde la semaine où le blocage est apparu.
    expect(avant.depuisSemaine).toBe("2026-10-19");
    await D.db.update(D.schema.lignesRapport).set({ resolu: true }).where(eq(D.schema.lignesRapport.id, avant.id));
    await D.db.update(D.schema.taches).set({ statut: "en_cours", blocage: null }).where(eq(D.schema.taches.id, t.id));
    const [frais] = await D.db.select().from(D.schema.rapportsHebdo).where(eq(D.schema.rapportsHebdo.id, brouillon.id));
    await R.completerBrouillon(frais, { marquer: false });
    const apres = await R.lignesDuRapport(brouillon.id);
    expect(apres.find((l) => l.id === avant.id)).toMatchObject({ partie: "bloque", resolu: true });
    const enCours = apres.find((l) => l.tacheId === t.id && l.partie === "en_cours" && !l.resolu);
    expect(enCours).toBeTruthy();
    // Remis en l'état pour les autres tests (brouillon de Daphnée).
    await D.db.delete(D.schema.lignesRapport).where(eq(D.schema.lignesRapport.id, enCours!.id));
    await D.db.update(D.schema.lignesRapport).set({ resolu: false }).where(eq(D.schema.lignesRapport.id, avant.id));
    await D.db.update(D.schema.taches).set({ statut: "bloquee", blocage: t.blocage }).where(eq(D.schema.taches.id, t.id));
  });
});
