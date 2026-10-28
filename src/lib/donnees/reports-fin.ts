/**
 * Reports de la date de fin prévue d'un projet : chaque changement est gardé (quand, de quelle date à
 * quelle date, par qui), pour montrer le glissement sur la fiche du projet.
 */
import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export async function noterReportFin(projetId: string, avant: string | null, apres: string | null, parId: string | null) {
  if ((avant ?? null) === (apres ?? null)) return;
  await db.insert(schema.reportsFinProjet).values({ projetId, avant, apres, parId });
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
      creeLe: schema.reportsFinProjet.creeLe,
    })
    .from(schema.reportsFinProjet)
    .where(eq(schema.reportsFinProjet.projetId, projetId))
    .orderBy(asc(schema.reportsFinProjet.creeLe));
}
