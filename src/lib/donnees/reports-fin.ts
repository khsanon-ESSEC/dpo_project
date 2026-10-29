/**
 * Reports de la date de fin prévue d'un projet : chaque changement est gardé (quand, de quelle date à
 * quelle date, par qui, pourquoi), pour montrer le glissement sur la fiche du projet.
 */
import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export async function noterReportFin(projetId: string, avant: string | null, apres: string | null, parId: string | null, motif = "") {
  if ((avant ?? null) === (apres ?? null)) return;
  await db.insert(schema.reportsFinProjet).values({ projetId, avant, apres, parId, motif: motif.slice(0, 300) });
}

/**
 * La fin prévue à laquelle comparer une nouvelle date pour exiger un motif : la fin prévue actuelle, ou, si elle a été
 * effacée, la dernière fin connue (puis la fin initiale). Sans cela, effacer la date puis en mettre une plus tardive
 * repoussait la fin sans motif (revue de sécurité du 29 octobre 2026).
 */
export async function finDeReference(p: { id: string; dateFinPrevue: string | null; dateFinInitiale: string | null }): Promise<string | null> {
  if (p.dateFinPrevue) return p.dateFinPrevue;
  const [r] = await db
    .select({ apres: schema.reportsFinProjet.apres, avant: schema.reportsFinProjet.avant })
    .from(schema.reportsFinProjet)
    .where(eq(schema.reportsFinProjet.projetId, p.id))
    .orderBy(desc(schema.reportsFinProjet.creeLe))
    .limit(1);
  return r?.apres ?? r?.avant ?? p.dateFinInitiale;
}

/** « Annuler » d'une mise à jour de la barre : retire le dernier report qu'elle avait noté. */
export async function oublierReportFin(projetId: string, avant: string | null, apres: string | null) {
  const p = schema.reportsFinProjet;
  const [r] = await db
    .select({ id: p.id })
    .from(p)
    .where(and(eq(p.projetId, projetId), apres ? eq(p.apres, apres) : isNull(p.apres), avant ? eq(p.avant, avant) : isNull(p.avant)))
    .orderBy(desc(p.creeLe))
    .limit(1);
  if (r) await db.delete(p).where(eq(p.id, r.id));
}

export async function reportsFinDe(projetId: string) {
  return db
    .select({
      avant: schema.reportsFinProjet.avant,
      apres: schema.reportsFinProjet.apres,
      motif: schema.reportsFinProjet.motif,
      parId: schema.reportsFinProjet.parId,
      creeLe: schema.reportsFinProjet.creeLe,
    })
    .from(schema.reportsFinProjet)
    .where(eq(schema.reportsFinProjet.projetId, projetId))
    .orderBy(asc(schema.reportsFinProjet.creeLe));
}
