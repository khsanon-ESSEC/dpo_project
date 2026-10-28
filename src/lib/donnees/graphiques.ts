/**
 * Données des graphiques : avancement d'un projet semaine par semaine, réunions par semaine et par projet.
 * Ce que chacun peut voir est filtré par l'appelant (projet visible, personnes suivies).
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, dateLocale, lundiDe } from "@/lib/dates";

/**
 * Avancement d'un projet : à la fin de chaque semaine, les tâches créées jusque-là et celles terminées.
 * Les tâches annulées n'y sont pas. Au plus `nb` semaines, à partir de la première tâche.
 */
export async function avancementDuProjet(projetId: string, jour: string, nb = 12) {
  const taches = await db
    .select({
      creeLe: schema.taches.creeLe,
      statut: schema.taches.statut,
      termineeLe: schema.taches.termineeLe,
    })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)));
  if (!taches.length) return [];
  const creees = taches.map((t) => dateLocale(t.creeLe)).sort();
  const faites = taches.filter((t) => t.statut === "faite" && t.termineeLe).map((t) => dateLocale(t.termineeLe!));
  const courante = lundiDe(jour);
  const premiere = lundiDe(creees[0]);
  const lundis: string[] = [];
  for (let l = courante; l >= premiere && lundis.length < nb; l = ajouterJours(l, -7)) lundis.unshift(l);
  return lundis.map((l) => {
    const fin = ajouterJours(l, 6) < jour ? ajouterJours(l, 6) : jour;
    return {
      lundi: l,
      total: creees.filter((d) => d <= fin).length,
      faites: faites.filter((d) => d <= fin).length,
      enCours: l === courante,
    };
  });
}

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
