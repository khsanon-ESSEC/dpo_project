/**
 * Personnes hors division : collègues d'autres départements, consultants. Une fiche (nom, département
 * ou société), sans accès par défaut ; tout le monde peut en ajouter une au besoin ; les administrateurs
 * corrigent les fiches, ouvrent un accès limité et fusionnent les doublons.
 */
import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { noter } from "@/lib/journal";
import { cleNom, separerNom } from "@/lib/projets";
import { reinitialiserMotDePasse } from "./organisation";

const court = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * La fiche d'une personne hors division : celle qui existe déjà sous ce nom (même département, ou
 * département inconnu d'un côté), sinon une nouvelle. Renvoie son identifiant, ou null si le nom est vide.
 */
export async function trouverOuCreerExterne(saisieNom: string, saisieOrganisation: string, parId: string): Promise<string | null> {
  const n = separerNom(court(saisieNom, 200));
  if (!n) return null;
  const organisation = court(saisieOrganisation, 120);
  const cle = cleNom(`${n.prenom} ${n.nom}`);
  const existants = await db
    .select({ id: schema.personnes.id, prenom: schema.personnes.prenom, nom: schema.personnes.nom, organisation: schema.personnes.organisation, actif: schema.personnes.actif })
    .from(schema.personnes)
    .where(eq(schema.personnes.externe, true));
  const meme = existants
    .filter((p) => cleNom(`${p.prenom} ${p.nom}`) === cle)
    .find((p) => !organisation || !p.organisation || cleNom(p.organisation) === cleNom(organisation));
  if (meme) {
    if (!meme.organisation && organisation) await db.update(schema.personnes).set({ organisation, majLe: new Date() }).where(eq(schema.personnes.id, meme.id));
    if (!meme.actif) await db.update(schema.personnes).set({ actif: true, majLe: new Date() }).where(eq(schema.personnes.id, meme.id));
    return meme.id;
  }
  const [p] = await db
    .insert(schema.personnes)
    .values({ prenom: n.prenom, nom: n.nom, organisation, externe: true, courriel: null, motDePasseHash: null, doitChangerMotDePasse: true, capaciteHeures: 0 })
    .returning({ id: schema.personnes.id });
  await noter(parId, "externe_ajoute", p.id, { nom: `${n.prenom} ${n.nom}`, organisation });
  return p.id;
}

/** Lit dans un formulaire « Quelqu'un qui n'est pas dans la liste » : `${prefixe}NomExterne`, `${prefixe}OrgExterne`. */
export async function externeDuFormulaire(form: FormData, prefixe: string, parId: string): Promise<string | null> {
  const nom = String(form.get(`${prefixe}NomExterne`) ?? "");
  if (!nom.trim()) return null;
  return trouverOuCreerExterne(nom, String(form.get(`${prefixe}OrgExterne`) ?? ""), parId);
}

export type ModificationExterne = { prenom: string; nom: string; organisation: string; poste: string; courriel: string; actif: boolean };

async function exigerExterne(id: string) {
  const [p] = await db.select().from(schema.personnes).where(and(eq(schema.personnes.id, id), eq(schema.personnes.externe, true)));
  if (!p) throw new Error("Cette fiche n'est pas celle d'une personne hors division.");
  return p;
}

export async function modifierExterne(parId: string, id: string, m: ModificationExterne) {
  const p = await exigerExterne(id);
  const prenom = court(m.prenom, 80);
  if (!prenom) throw new Error("Le prénom est nécessaire.");
  const courriel = court(m.courriel, 200).toLowerCase();
  if (courriel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) throw new Error("Adresse courriel invalide.");
  if (!courriel && p.motDePasseHash) throw new Error("Cette personne a un accès : son adresse courriel est nécessaire pour se connecter.");
  try {
    await db
      .update(schema.personnes)
      .set({ prenom, nom: court(m.nom, 120), organisation: court(m.organisation, 120), poste: court(m.poste, 120), courriel: courriel || null, actif: m.actif, majLe: new Date() })
      .where(eq(schema.personnes.id, id));
  } catch (e) {
    const t = (e as Error).message;
    if (t.includes("unique") || t.includes("duplicate")) throw new Error("Cette adresse courriel est déjà utilisée.");
    throw e;
  }
  if (!m.actif) await db.delete(schema.sessions).where(eq(schema.sessions.personneId, id));
  await noter(parId, "externe_modifie", id, { ...m });
}

/** Ouvre un accès limité (ses tâches, ses projets) : mot de passe provisoire, affiché une seule fois. */
export async function ouvrirAccesExterne(parId: string, id: string): Promise<string> {
  const p = await exigerExterne(id);
  if (!p.courriel) throw new Error("Ajoutez d'abord son adresse courriel : elle sert à se connecter.");
  const provisoire = await reinitialiserMotDePasse(parId, id);
  await noter(parId, "externe_acces_ouvert", id);
  return provisoire;
}

export async function fermerAccesExterne(parId: string, id: string) {
  await exigerExterne(id);
  await db.update(schema.personnes).set({ motDePasseHash: null, doitChangerMotDePasse: true, majLe: new Date() }).where(eq(schema.personnes.id, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.personneId, id));
  await noter(parId, "externe_acces_ferme", id);
}

/**
 * Fusionne deux fiches de la même personne : tout ce qui pointe vers `sourceId` (tâches, équipes
 * projet, réunions, projets) passe à `cibleId`, puis la fiche en double disparaît.
 */
export async function fusionnerExternes(parId: string, sourceId: string, cibleId: string) {
  if (sourceId === cibleId) throw new Error("Choisissez une autre fiche.");
  const [source, cible] = [await exigerExterne(sourceId), await exigerExterne(cibleId)];
  await db.transaction(async (tx) => {
    await tx.update(schema.taches).set({ assigneId: cibleId }).where(eq(schema.taches.assigneId, sourceId));
    await tx.update(schema.taches).set({ creeParId: cibleId }).where(eq(schema.taches.creeParId, sourceId));
    await tx.update(schema.projets).set({ chefProjetId: cibleId }).where(eq(schema.projets.chefProjetId, sourceId));
    // Équipes projet et réunions : sans créer de doublon là où la cible figure déjà.
    const projetsCible = (await tx.select({ id: schema.membresProjet.projetId }).from(schema.membresProjet).where(eq(schema.membresProjet.personneId, cibleId))).map((x) => x.id);
    if (projetsCible.length) await tx.delete(schema.membresProjet).where(and(eq(schema.membresProjet.personneId, sourceId), inArray(schema.membresProjet.projetId, projetsCible)));
    await tx.update(schema.membresProjet).set({ personneId: cibleId }).where(eq(schema.membresProjet.personneId, sourceId));
    const reunionsCible = (await tx.select({ id: schema.participantsReunion.reunionId }).from(schema.participantsReunion).where(eq(schema.participantsReunion.personneId, cibleId))).map((x) => x.id);
    if (reunionsCible.length) await tx.delete(schema.participantsReunion).where(and(eq(schema.participantsReunion.personneId, sourceId), inArray(schema.participantsReunion.reunionId, reunionsCible)));
    await tx.update(schema.participantsReunion).set({ personneId: cibleId }).where(eq(schema.participantsReunion.personneId, sourceId));
    await tx.update(schema.reunions).set({ noteeParId: cibleId }).where(eq(schema.reunions.noteeParId, sourceId));
    await tx.update(schema.evenementsTache).set({ auteurId: cibleId }).where(eq(schema.evenementsTache.auteurId, sourceId));
    await tx.update(schema.notifications).set({ personneId: cibleId }).where(eq(schema.notifications.personneId, sourceId));
    if (!cible.organisation && source.organisation) await tx.update(schema.personnes).set({ organisation: source.organisation }).where(eq(schema.personnes.id, cibleId));
    if (!cible.courriel && source.courriel) {
      await tx.update(schema.personnes).set({ courriel: null }).where(eq(schema.personnes.id, sourceId));
      await tx.update(schema.personnes).set({ courriel: source.courriel }).where(eq(schema.personnes.id, cibleId));
    }
    await tx.delete(schema.sessions).where(eq(schema.sessions.personneId, sourceId));
    await tx.delete(schema.personnes).where(eq(schema.personnes.id, sourceId));
  });
  await noter(parId, "externes_fusionnes", cibleId, { source: sourceId, nom: `${source.prenom} ${source.nom}` });
}

/** Les autres fiches hors division (pour choisir avec quoi fusionner). */
export async function autresExternes(id: string) {
  return db
    .select({ id: schema.personnes.id, prenom: schema.personnes.prenom, nom: schema.personnes.nom, organisation: schema.personnes.organisation })
    .from(schema.personnes)
    .where(and(eq(schema.personnes.externe, true), ne(schema.personnes.id, id)));
}
