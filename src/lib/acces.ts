/**
 * Couche d'accès : chaque lecture passe par ici, avec les règles de src/lib/regles.ts.
 * Une page ne lit jamais la base sans ces filtres.
 */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
  /** Projets dont je suis le chef. */
  projetsDiriges: Set<string>;
  equipeDirecte: string[];
};

export const acces = cache(async (moi: Utilisateur): Promise<Acces> => {
  const org = await chargerOrganisation();
  const diriges = await db.select({ id: schema.projets.id }).from(schema.projets).where(eq(schema.projets.chefProjetId, moi.id));
  return {
    moi,
    toutVoir: voitTout(moi),
    directeur: moi.directeur,
    suivis: personnesSuivies(org, moi),
    projetsDiriges: new Set(diriges.map((d) => d.id)),
    equipeDirecte: subordonnesDirects(org, moi.id).map((p) => p.id),
  };
});

export function suitPersonne(a: Acces, personneId: string): boolean {
  return a.suivis === "toutes" || a.suivis.has(personneId);
}

/** Lire une tâche : la personne assignée, son supérieur (ou son directeur), le chef du projet, les exécutifs. */
export function peutVoirTache(a: Acces, t: { assigneId: string; projetId: string | null }): boolean {
  return suitPersonne(a, t.assigneId) || (t.projetId !== null && a.projetsDiriges.has(t.projetId));
}

/** Modifier une tâche : mêmes personnes. */
export const peutModifierTache = peutVoirTache;

export async function exigerTacheVisible(a: Acces, tacheId: string) {
  const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, tacheId)).limit(1);
  if (!t || !peutVoirTache(a, t)) notFound();
  return t;
}

/**
 * Projets visibles : exécutif = tous ; sinon ceux que je dirige, ceux où travaille une
 * personne que je suis, et (directeur) ceux que dirige un membre de ma direction.
 */
export async function idsProjetsVisibles(a: Acces): Promise<Set<string> | "tous"> {
  if (a.toutVoir) return "tous";
  const ids = new Set(a.projetsDiriges);
  const lignes = await db.selectDistinct({ projetId: schema.taches.projetId, assigneId: schema.taches.assigneId }).from(schema.taches);
  for (const l of lignes) if (l.projetId && suitPersonne(a, l.assigneId)) ids.add(l.projetId);
  if (a.directeur) {
    const projets = await db.select({ id: schema.projets.id, chef: schema.projets.chefProjetId }).from(schema.projets);
    for (const p of projets) if (p.chef && suitPersonne(a, p.chef)) ids.add(p.id);
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
  if (!a.toutVoir && !a.directeur) notFound();
}
