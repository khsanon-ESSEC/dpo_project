/**
 * Couche d'accès : chaque lecture passe par ici, avec les règles de src/lib/regles.ts.
 * Une page ne lit jamais la base sans ces filtres.
 */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Utilisateur } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/organisation";
import { estSuperieurDe, personnesSuivies, subordonnesDirects, voitTout } from "@/lib/regles";

export type Acces = {
  moi: Utilisateur;
  /** Exécutif : voit tout. */
  toutVoir: boolean;
  /** Directeur : voit sa direction, à tous les niveaux. */
  directeur: boolean;
  /** Personnes dont je vois les tâches et les rapports complets (moi compris). */
  suivis: Set<string> | "toutes";
  /** Projets dont je suis le chef, ou le référent de la DPO. */
  projetsDiriges: Set<string>;
  /** Projets dont je suis membre (équipe projet). */
  projetsMembre: Set<string>;
  equipeDirecte: string[];
};

export const acces = cache(async (moi: Utilisateur): Promise<Acces> => {
  const org = await chargerOrganisation();
  // Projets que je dirige : j'en suis le référent de la DPO, ou le chef s'il n'y a pas de référent.
  // Le chef hors division d'un projet d'une autre division ne le dirige pas ici : c'est son référent.
  // Une personne hors division (accès limité) ne dirige aucun projet et n'a aucun rôle étendu.
  const diriges = moi.externe
    ? []
    : await db
        .select({ id: schema.projets.id })
        .from(schema.projets)
        .where(or(eq(schema.projets.referentId, moi.id), and(eq(schema.projets.chefProjetId, moi.id), isNull(schema.projets.referentId))));
  const membre = await db.select({ id: schema.membresProjet.projetId }).from(schema.membresProjet).where(eq(schema.membresProjet.personneId, moi.id));
  return {
    moi,
    toutVoir: !moi.externe && voitTout(moi),
    directeur: !moi.externe && moi.directeur,
    suivis: personnesSuivies(org, moi),
    projetsDiriges: new Set(diriges.map((d) => d.id)),
    projetsMembre: new Set(membre.map((d) => d.id)),
    equipeDirecte: subordonnesDirects(org, moi.id).map((p) => p.id),
  };
});

export function suitPersonne(a: Acces, personneId: string): boolean {
  return a.suivis === "toutes" || a.suivis.has(personneId);
}

/**
 * Lire une tâche : la personne assignée, son supérieur (ou son directeur), le chef du projet, les
 * exécutifs, et la personne qui l'a confiée (elle suit les tâches confiées hors division).
 */
export function peutVoirTache(a: Acces, t: { assigneId: string; projetId: string | null; creeParId?: string | null }): boolean {
  return suitPersonne(a, t.assigneId) || (t.projetId !== null && a.projetsDiriges.has(t.projetId)) || (!!t.creeParId && t.creeParId === a.moi.id);
}

/** Modifier une tâche : mêmes personnes. */
export const peutModifierTache = peutVoirTache;

export async function exigerTacheVisible(a: Acces, tacheId: string) {
  const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, tacheId)).limit(1);
  if (!t || !peutVoirTache(a, t)) notFound();
  return t;
}

/**
 * Projets visibles : exécutif = tous ; sinon ceux que je dirige, ceux dont je suis membre, ceux
 * où travaille (ou est membre) une personne que je suis, ceux que j'ai proposés ou qu'une personne
 * que je suis a proposés, et (directeur) ceux que dirige un membre de ma direction.
 */
export async function idsProjetsVisibles(a: Acces): Promise<Set<string> | "tous"> {
  if (a.toutVoir) return "tous";
  const ids = new Set([...a.projetsDiriges, ...a.projetsMembre]);
  // Une tâche annulée n'ouvre plus le projet à la personne à qui elle était confiée.
  const lignes = await db.selectDistinct({ projetId: schema.taches.projetId, assigneId: schema.taches.assigneId }).from(schema.taches).where(isNull(schema.taches.annuleeLe));
  for (const l of lignes) if (l.projetId && suitPersonne(a, l.assigneId)) ids.add(l.projetId);
  const membres = await db.select({ projetId: schema.membresProjet.projetId, personneId: schema.membresProjet.personneId }).from(schema.membresProjet);
  for (const m of membres) if (suitPersonne(a, m.personneId)) ids.add(m.projetId);
  const projets = await db.select({ id: schema.projets.id, chef: sql<string | null>`coalesce(${schema.projets.referentId}, ${schema.projets.chefProjetId})`, demandeur: schema.projets.demandeParId }).from(schema.projets);
  for (const p of projets) {
    if (p.demandeur && (p.demandeur === a.moi.id || suitPersonne(a, p.demandeur))) ids.add(p.id);
    if (a.directeur && p.chef && suitPersonne(a, p.chef)) ids.add(p.id);
  }
  return ids;
}

export async function exigerProjetVisible(a: Acces, projetId: string) {
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(projetId)) notFound();
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId)).limit(1);
  if (!p) notFound();
  return p;
}

/**
 * Lignes des rapports du vendredi sur un projet :
 * - le chef du projet et les exécutifs voient toutes les lignes ;
 * - un directeur voit celles des membres de sa direction ;
 * - les autres, aucune.
 * Renvoie « toutes », un ensemble d'auteurs autorisés, ou null.
 */
export function auteursLignesVisibles(a: Acces, projetId: string): "toutes" | Set<string> | null {
  if (a.toutVoir || a.projetsDiriges.has(projetId)) return "toutes";
  if (a.directeur && a.suivis !== "toutes") return a.suivis;
  return null;
}

export async function estMonSuperieur(moiId: string, personneId: string) {
  return estSuperieurDe(await chargerOrganisation(), personneId, moiId);
}

/** Rapport au conseil : exécutifs (tout) et directeurs (projets de leur direction). */
export function exigerAccesConseil(a: Acces) {
  if (a.moi.externe || (!a.toutVoir && !a.directeur)) notFound();
}

/**
 * Les personnes qu'une personne hors division (accès limité) peut voir et choisir : le chef, le
 * référent, l'équipe et les personnes chargées de tâches des projets où elle intervient, les
 * participants de ses réunions et les personnes qui lui ont confié une tâche. Pas l'annuaire entier.
 */
export async function contactsVisibles(a: Acces): Promise<Set<string>> {
  const ids = new Set<string>([a.moi.id]);
  const visibles = await idsProjetsVisibles(a);
  const projetIds = visibles === "tous" ? [] : [...visibles];
  if (projetIds.length) {
    for (const p of await db.select({ chef: schema.projets.chefProjetId, referent: schema.projets.referentId }).from(schema.projets).where(inArray(schema.projets.id, projetIds))) {
      if (p.chef) ids.add(p.chef);
      if (p.referent) ids.add(p.referent);
    }
    for (const m of await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(inArray(schema.membresProjet.projetId, projetIds))) ids.add(m.id);
    for (const t of await db.select({ id: schema.taches.assigneId }).from(schema.taches).where(and(inArray(schema.taches.projetId, projetIds), isNull(schema.taches.annuleeLe)))) ids.add(t.id);
  }
  for (const t of await db.select({ par: schema.taches.creeParId }).from(schema.taches).where(eq(schema.taches.assigneId, a.moi.id))) if (t.par) ids.add(t.par);
  const mesReunions = db.select({ id: schema.participantsReunion.reunionId }).from(schema.participantsReunion).where(eq(schema.participantsReunion.personneId, a.moi.id));
  for (const p of await db.select({ id: schema.participantsReunion.personneId }).from(schema.participantsReunion).where(inArray(schema.participantsReunion.reunionId, mesReunions))) ids.add(p.id);
  return ids;
}
