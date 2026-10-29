/**
 * Le rapport au conseil tel qu'il part (29 octobre 2026) : santé, livrables et risque critique de chaque projet, lus
 * le jour même tant que le rapport est un brouillon, puis figés à l'approbation (lignes_conseil.apercu), pour que le
 * rapport approuvé se relise tel qu'il a été envoyé.
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui } from "@/lib/dates";
import type { ApercuConseil } from "@/lib/presentation-conseil";
import { livrablesDe } from "./livrables";
import { risquesCritiquesPrincipaux } from "./risques";

/** L'aperçu du jour, projet par projet. */
export async function apercusDuJour(projetIds: string[], jour = aujourdhui()): Promise<Map<string, ApercuConseil>> {
  const m = new Map<string, ApercuConseil>();
  if (!projetIds.length) return m;
  const [projets, { livrables }, risques] = await Promise.all([
    db.select({ id: schema.projets.id, sante: schema.projets.sante }).from(schema.projets).where(inArray(schema.projets.id, projetIds)),
    livrablesDe(projetIds, jour),
    risquesCritiquesPrincipaux(projetIds),
  ]);
  for (const p of projets) {
    const siens = livrables.filter((l) => l.projetId === p.id);
    const ouverts = siens.filter((l) => l.etat !== "atteint").sort((a, b) => (a.prevuLe ?? "9999").localeCompare(b.prevuLe ?? "9999"));
    const prochain = ouverts[0];
    m.set(p.id, {
      sante: p.sante,
      livrables: siens.length ? { valides: siens.length - ouverts.length, total: siens.length, prochain: prochain ? { libelle: prochain.libelle, prevuLe: prochain.prevuLe, enRetard: prochain.enRetard } : null } : null,
      risqueCritique: risques.get(p.id) ?? null,
      le: jour,
    });
  }
  return m;
}

/** À l'approbation : l'aperçu du jour est inscrit dans chaque ligne du rapport. */
export async function figerApercus(rapportId: string, jour = aujourdhui()) {
  const lignes = await db.select({ id: schema.lignesConseil.id, projetId: schema.lignesConseil.projetId }).from(schema.lignesConseil).where(eq(schema.lignesConseil.rapportId, rapportId));
  const apercus = await apercusDuJour(
    lignes.map((l) => l.projetId),
    jour,
  );
  for (const l of lignes) {
    const a = apercus.get(l.projetId);
    if (a) await db.update(schema.lignesConseil).set({ apercu: a }).where(eq(schema.lignesConseil.id, l.id));
  }
}
