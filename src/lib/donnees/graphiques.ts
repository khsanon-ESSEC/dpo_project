/**
 * Données des graphiques : avancement d'un projet par période, réunions par période et par projet.
 * Ce que chacun peut voir est filtré par l'appelant (projet visible, personnes suivies).
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { dateLocale, lundiDe } from "@/lib/dates";

/**
 * Réunions de ces personnes entre deux dates : minutes par semaine, et par projet. Une réunion compte pour
 * chaque participant (des heures-personnes) : deux personnes de l'équipe dans la même heure de réunion font
 * deux heures.
 */
export async function reunionsEnChiffres(personneIds: string[], debut: string, fin: string) {
  if (!personneIds.length)
    return {
      parSemaine: new Map<string, number>(),
      parProjet: new Map<string | null, number>(),
    };
  const lignes = await db
    .select({
      jour: schema.reunions.jour,
      minutes: schema.reunions.dureeMinutes,
      projetId: schema.reunions.projetId,
    })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(inArray(schema.participantsReunion.personneId, personneIds), gte(schema.reunions.jour, debut), lte(schema.reunions.jour, fin)));
  const parSemaine = new Map<string, number>();
  const parProjet = new Map<string | null, number>();
  for (const l of lignes) {
    const lundi = lundiDe(l.jour);
    parSemaine.set(lundi, (parSemaine.get(lundi) ?? 0) + l.minutes);
    parProjet.set(l.projetId, (parProjet.get(l.projetId) ?? 0) + l.minutes);
  }
  return { parSemaine, parProjet };
}

/** Minutes de réunion de ces personnes (heures-personnes) dans chaque période, en une seule lecture. */
export async function minutesReunionParPeriode(personneIds: string[], periodes: { debut: string; fin: string }[]): Promise<number[]> {
  if (!personneIds.length || !periodes.length) return periodes.map(() => 0);
  const debut = periodes.reduce((m, p) => (p.debut < m ? p.debut : m), periodes[0].debut);
  const fin = periodes.reduce((m, p) => (p.fin > m ? p.fin : m), periodes[0].fin);
  const lignes = await db
    .select({ jour: schema.reunions.jour, minutes: schema.reunions.dureeMinutes })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(inArray(schema.participantsReunion.personneId, personneIds), gte(schema.reunions.jour, debut), lte(schema.reunions.jour, fin)));
  return periodes.map((p) => lignes.filter((l) => l.jour >= p.debut && l.jour <= p.fin).reduce((s, l) => s + l.minutes, 0));
}

/**
 * Avancement d'un projet aux fins de chaque période (bornées à aujourd'hui) : tâches créées jusque-là et tâches
 * terminées ; et le nombre de tâches terminées pendant chaque période. Les tâches annulées n'y sont pas.
 */
export async function avancementParPeriode(projetId: string, periodes: { debut: string; fin: string }[], jour: string) {
  const taches = await db
    .select({ creeLe: schema.taches.creeLe, statut: schema.taches.statut, termineeLe: schema.taches.termineeLe })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)));
  const creees = taches.map((t) => dateLocale(t.creeLe));
  const faites = taches.filter((t) => t.statut === "faite" && t.termineeLe).map((t) => dateLocale(t.termineeLe!));
  const premiere = creees.length ? creees.reduce((m, d) => (d < m ? d : m)) : null;
  return periodes.map((p) => {
    const fin = p.fin < jour ? p.fin : jour;
    return {
      total: creees.filter((d) => d <= fin).length,
      faites: faites.filter((d) => d <= fin).length,
      terminees: faites.filter((d) => d >= p.debut && d <= fin).length,
      /** Le projet n'avait encore aucune tâche à la fin de la période. */
      avant: !premiere || premiere > fin,
    };
  });
}
