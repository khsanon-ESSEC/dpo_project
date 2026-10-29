/**
 * Temps réellement passé sur les tâches (décision du 28 octobre 2026) : noté par jour, comparé à l'estimation.
 * Compté pour la personne de la tâche ; noté par elle ou par qui peut modifier la tâche (une tâche confiée hors
 * division, par exemple). La charge réalisée reste une estimation à partir des tâches terminées : le temps passé
 * est ce que chacun note, à côté.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { peutModifierTache, type Acces } from "@/lib/acces";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";

type Tache = typeof schema.taches.$inferSelect;

/** On note le temps des 60 derniers jours au plus (pas dans le futur). */
export const JOURS_RETRO = 60;

export async function tempsDeLaTache(tacheId: string) {
  const [lignes, org] = await Promise.all([db.select().from(schema.tempsPasse).where(eq(schema.tempsPasse.tacheId, tacheId)).orderBy(desc(schema.tempsPasse.jour), desc(schema.tempsPasse.creeLe)), chargerOrganisation()]);
  const nom = (id: string | null) => (id && org.personnes.get(id) ? nomComplet(org.personnes.get(id)!) : null);
  return { entrees: lignes.map((l) => ({ ...l, personne: nom(l.personneId), notePar: nom(l.noteParId) })), minutes: lignes.reduce((s, l) => s + l.minutes, 0) };
}

export async function noterTemps(a: Acces, t: Tache, d: { jour: string | null; minutes: number | null; note: string }): Promise<{ ok: true } | { erreur: string }> {
  if (!peutModifierTache(a, t)) return { erreur: "Vous ne pouvez pas noter de temps sur cette tâche." };
  if (t.annuleeLe) return { erreur: "Cette tâche est annulée." };
  if (!d.minutes) return { erreur: "Indiquez une durée : « 1h30 », « 45 min », « 2 »." };
  const jour = d.jour && /^\d{4}-\d{2}-\d{2}$/.test(d.jour) ? d.jour : aujourdhui();
  if (jour > aujourdhui()) return { erreur: "Le temps se note une fois passé : pas de date future." };
  if (jour < ajouterJours(aujourdhui(), -JOURS_RETRO)) return { erreur: `On note le temps des ${JOURS_RETRO} derniers jours.` };
  await db.insert(schema.tempsPasse).values({ tacheId: t.id, personneId: t.assigneId, jour, minutes: d.minutes, note: d.note.replace(/\s+/g, " ").trim().slice(0, 300), noteParId: a.moi.id });
  await noter(a.moi.id, "temps_note", t.id, { minutes: d.minutes, jour });
  return { ok: true };
}

export async function retirerTemps(a: Acces, t: Tache, entreeId: string): Promise<{ ok: true } | { erreur: string }> {
  const [e] = await db.select().from(schema.tempsPasse).where(and(eq(schema.tempsPasse.id, entreeId), eq(schema.tempsPasse.tacheId, t.id)));
  if (!e) return { erreur: "Temps introuvable." };
  if (e.noteParId !== a.moi.id && !peutModifierTache(a, t)) return { erreur: "Vous ne pouvez pas retirer ce temps." };
  await db.delete(schema.tempsPasse).where(eq(schema.tempsPasse.id, entreeId));
  await noter(a.moi.id, "temps_retire", t.id, { minutes: e.minutes });
  return { ok: true };
}

/** Projet : le temps noté sur ses tâches (non annulées), et le temps estimé de ces mêmes tâches. */
export async function tempsDuProjet(projetId: string) {
  const [noteRow] = await db
    .select({ minutes: sql<number>`coalesce(sum(${schema.tempsPasse.minutes}), 0)::int` })
    .from(schema.tempsPasse)
    .innerJoin(schema.taches, eq(schema.taches.id, schema.tempsPasse.tacheId))
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)));
  const [estime] = await db
    .select({ heures: sql<number>`coalesce(sum(${schema.taches.estimationHeures}), 0)::int`, avecTemps: sql<number>`count(distinct ${schema.tempsPasse.tacheId})::int` })
    .from(schema.taches)
    .leftJoin(schema.tempsPasse, eq(schema.tempsPasse.tacheId, schema.taches.id))
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)));
  return { minutes: noteRow?.minutes ?? 0, heuresEstimees: estime?.heures ?? 0, tachesAvecTemps: estime?.avecTemps ?? 0 };
}

/** Le temps noté par personne sur une période (fiche d'une personne, équipe). */
export async function tempsDesPersonnes(personneIds: string[], debut: string, fin: string) {
  const m = new Map<string, number>();
  if (!personneIds.length) return m;
  const l = await db
    .select({ personneId: schema.tempsPasse.personneId, minutes: sql<number>`sum(${schema.tempsPasse.minutes})::int` })
    .from(schema.tempsPasse)
    .where(and(inArray(schema.tempsPasse.personneId, personneIds), gte(schema.tempsPasse.jour, debut), lte(schema.tempsPasse.jour, fin)))
    .groupBy(schema.tempsPasse.personneId);
  for (const x of l) m.set(x.personneId, x.minutes);
  return m;
}
