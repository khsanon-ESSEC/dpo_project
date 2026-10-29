/**
 * Tâches récurrentes (lot 4, décision du 28 octobre 2026). Règles pures : src/lib/recurrence.ts.
 * Qui peut modifier une tâche peut la faire se répéter ; la tâche sert de modèle et compte comme la première
 * occurrence. Les occurrences suivantes sont créées par la tournée horaire (src/instrumentation.ts) quelques jours
 * avant leur échéance ; plusieurs copies de l'application peuvent tourner : chaque occurrence est réservée en base.
 */
import "server-only";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { peutModifierTache, type Acces } from "@/lib/acces";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { projetOuvert } from "@/lib/projets";
import { DELAI_CREATION, lireRythme, premiereEcheance, prochaineOccurrence, type Frequence } from "@/lib/recurrence";

type Tache = typeof schema.taches.$inferSelect;
export type Regle = typeof schema.tachesRecurrentes.$inferSelect;

export async function regleDe(t: Pick<Tache, "recurrenceId">): Promise<Regle | null> {
  if (!t.recurrenceId) return null;
  const [r] = await db.select().from(schema.tachesRecurrentes).where(eq(schema.tachesRecurrentes.id, t.recurrenceId));
  return r ?? null;
}

/** Faire se répéter une tâche : « semaine:1 » (chaque lundi) … « mois:31 » (chaque fin de mois). */
export async function repeterTache(a: Acces, t: Tache, rythme: string): Promise<{ ok: true; id: string } | { erreur: string }> {
  if (!peutModifierTache(a, t)) return { erreur: "Vous ne pouvez pas modifier cette tâche." };
  if (t.annuleeLe) return { erreur: "Cette tâche est annulée." };
  const r = lireRythme(rythme);
  if (!r) return { erreur: "Choisissez un rythme : chaque semaine tel jour, ou chaque mois." };
  const actuelle = await regleDe(t);
  if (actuelle && !actuelle.arreteeLe) return { erreur: "Cette tâche se répète déjà : arrêtez la répétition pour en changer le rythme." };
  if (t.projetId) {
    const [p] = await db.select({ statut: schema.projets.statut, archiveLe: schema.projets.archiveLe }).from(schema.projets).where(eq(schema.projets.id, t.projetId));
    if (!p || !projetOuvert(p)) return { erreur: "Ce projet ne reçoit plus de tâches." };
  }
  const jour = aujourdhui();
  // La tâche est la première occurrence : sans échéance, elle prend la première du rythme (aujourd'hui compris).
  const premiere = t.echeance ?? premiereEcheance(r.frequence, r.jour, ajouterJours(jour, -1));
  // La suivante vient après la première, et pas dans le passé (une tâche en retard qu'on fait se répéter).
  const prochaine = premiereEcheance(r.frequence, r.jour, premiere >= jour ? premiere : ajouterJours(jour, -1));
  const [regle] = await db
    .insert(schema.tachesRecurrentes)
    .values({ projetId: t.projetId, livrableId: t.livrableId, titre: t.titre, description: t.description, assigneId: t.assigneId, estimationHeures: t.estimationHeures, priorite: t.priorite, frequence: r.frequence, jour: r.jour, prochaineLe: prochaine, creeParId: a.moi.id })
    .returning({ id: schema.tachesRecurrentes.id });
  await db.update(schema.taches).set({ recurrenceId: regle.id, echeance: premiere, majLe: new Date() }).where(eq(schema.taches.id, t.id));
  if (!t.echeance) await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: a.moi.id, type: "echeance", avant: null, apres: premiere });
  await noter(a.moi.id, "tache_repetee", t.id, { rythme: `${r.frequence}:${r.jour}` });
  await genererOccurrences(jour, regle.id);
  return { ok: true, id: regle.id };
}

/** Arrêter la répétition : qui peut modifier la tâche, ou qui a créé la règle. Les occurrences déjà créées restent. */
export async function arreterRepetition(a: Acces, t: Tache): Promise<{ ok: true } | { erreur: string }> {
  const r = await regleDe(t);
  if (!r) return { erreur: "Cette tâche ne se répète pas." };
  if (!peutModifierTache(a, t) && r.creeParId !== a.moi.id) return { erreur: "Vous ne pouvez pas modifier cette tâche." };
  if (!r.arreteeLe) await db.update(schema.tachesRecurrentes).set({ arreteeLe: new Date() }).where(eq(schema.tachesRecurrentes.id, r.id));
  await noter(a.moi.id, "repetition_arretee", t.id, { regle: r.id });
  return { ok: true };
}

/**
 * Crée les occurrences dues (toutes les règles actives, ou une seule). Une règle dont la personne n'est plus active,
 * ou dont le projet est fermé, s'arrête d'elle-même. Renvoie le nombre de tâches créées.
 */
export async function genererOccurrences(jour = aujourdhui(), regleId?: string): Promise<number> {
  // Les règles dont l'échéance visée est assez proche (le plus long délai, puis le calcul exact).
  const limite = ajouterJours(jour, Math.max(...Object.values(DELAI_CREATION)));
  const regles = await db
    .select()
    .from(schema.tachesRecurrentes)
    .where(and(isNull(schema.tachesRecurrentes.arreteeLe), lte(schema.tachesRecurrentes.prochaineLe, limite), regleId ? eq(schema.tachesRecurrentes.id, regleId) : undefined));
  let n = 0;
  for (const r of regles) {
    const o = prochaineOccurrence({ frequence: r.frequence as Frequence, jour: r.jour, prochaineLe: r.prochaineLe }, jour);
    if (!o.creer) {
      // Échéance passée sans création (serveur arrêté) : on vise la prochaine, sans rattraper.
      if (o.cible !== r.prochaineLe) await db.update(schema.tachesRecurrentes).set({ prochaineLe: o.cible }).where(and(eq(schema.tachesRecurrentes.id, r.id), eq(schema.tachesRecurrentes.prochaineLe, r.prochaineLe)));
      continue;
    }
    const [personne] = await db.select({ actif: schema.personnes.actif }).from(schema.personnes).where(eq(schema.personnes.id, r.assigneId));
    const [projet] = r.projetId ? await db.select({ statut: schema.projets.statut, archiveLe: schema.projets.archiveLe }).from(schema.projets).where(eq(schema.projets.id, r.projetId)) : [null];
    if (!personne?.actif || (r.projetId && (!projet || !projetOuvert(projet)))) {
      await db.update(schema.tachesRecurrentes).set({ arreteeLe: new Date() }).where(eq(schema.tachesRecurrentes.id, r.id));
      continue;
    }
    // Réservation : seule la copie qui avance la règle crée l'occurrence.
    const pris = await db
      .update(schema.tachesRecurrentes)
      .set({ prochaineLe: o.suivante })
      .where(and(eq(schema.tachesRecurrentes.id, r.id), eq(schema.tachesRecurrentes.prochaineLe, r.prochaineLe), isNull(schema.tachesRecurrentes.arreteeLe)))
      .returning({ id: schema.tachesRecurrentes.id });
    if (!pris.length) continue;
    // Le livrable n'est repris que s'il est encore du projet et pas validé.
    const [lv] = r.livrableId ? await db.select({ projetId: schema.indicateurs.projetId, etat: schema.indicateurs.etat }).from(schema.indicateurs).where(eq(schema.indicateurs.id, r.livrableId)) : [null];
    const livrableId = lv && lv.projetId === r.projetId && lv.etat !== "atteint" ? r.livrableId : null;
    const [t] = await db
      .insert(schema.taches)
      .values({ titre: r.titre, description: r.description, projetId: r.projetId, assigneId: r.assigneId, echeance: o.cible, estimationHeures: r.estimationHeures, priorite: r.priorite, creeParId: r.creeParId, livrableId, recurrenceId: r.id })
      .returning({ id: schema.taches.id });
    await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: r.creeParId ?? r.assigneId, type: "creation", note: "Tâche récurrente" });
    n += 1;
  }
  return n;
}

/** Pour les listes : les règles actives de ces tâches (rythme en clair). */
export async function reglesActives(ids: string[]) {
  const m = new Map<string, Regle>();
  if (!ids.length) return m;
  const l = await db.select().from(schema.tachesRecurrentes).where(isNull(schema.tachesRecurrentes.arreteeLe));
  const voulues = new Set(ids);
  for (const r of l) if (voulues.has(r.id)) m.set(r.id, r);
  return m;
}
