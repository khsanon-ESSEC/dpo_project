"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigerUtilisateur } from "@/lib/auth/session";
import { envoyerRapport } from "@/lib/donnees/rapport";

const PARTIES = ["fait", "en_cours", "bloque", "prochaine"] as const;
type Partie = (typeof PARTIES)[number];

/** Le rapport doit appartenir à la personne connectée et être encore un brouillon. */
async function monBrouillon(rapportId: string) {
  const u = await exigerUtilisateur();
  const [r] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.id, rapportId), eq(schema.rapportsHebdo.auteurId, u.id), eq(schema.rapportsHebdo.statut, "brouillon")));
  if (!r) throw new Error("Rapport introuvable ou déjà envoyé.");
  return { u, r };
}

async function maLigne(ligneId: string) {
  const [l] = await db.select().from(schema.lignesRapport).where(eq(schema.lignesRapport.id, ligneId));
  if (!l) throw new Error("Ligne introuvable.");
  await monBrouillon(l.rapportId);
  return l;
}

export async function modifierLigne(ligneId: string, texte: string) {
  await maLigne(ligneId);
  const t = texte.trim().slice(0, 500);
  if (!t) return supprimerLigne(ligneId);
  await db.update(schema.lignesRapport).set({ texte: t, proposeeParIa: false }).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

export async function changerProjetLigne(ligneId: string, projetId: string | null) {
  await maLigne(ligneId);
  await db.update(schema.lignesRapport).set({ projetId: projetId || null }).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

export async function supprimerLigne(ligneId: string) {
  await maLigne(ligneId);
  await db.delete(schema.lignesRapport).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

export async function ajouterLigne(rapportId: string, partie: Partie, form: FormData) {
  await monBrouillon(rapportId);
  if (!PARTIES.includes(partie)) return;
  const texte = String(form.get("texte") ?? "").trim().slice(0, 500);
  if (!texte) return;
  const projetId = String(form.get("projetId") ?? "") || null;
  const [{ m }] = await db.select({ m: max(schema.lignesRapport.ordre) }).from(schema.lignesRapport).where(eq(schema.lignesRapport.rapportId, rapportId));
  await db.insert(schema.lignesRapport).values({ rapportId, partie, texte, projetId, ordre: (m ?? 0) + 1 });
  revalidatePath("/rapport");
}

export async function basculerPartieRelue(rapportId: string, partie: Partie) {
  const { r } = await monBrouillon(rapportId);
  const relues = new Set(r.partiesRelues);
  if (relues.has(partie)) relues.delete(partie);
  else relues.add(partie);
  await db.update(schema.rapportsHebdo).set({ partiesRelues: [...relues], majLe: new Date() }).where(eq(schema.rapportsHebdo.id, rapportId));
  revalidatePath("/rapport");
}

export async function envoyer(rapportId: string) {
  const { u } = await monBrouillon(rapportId);
  await envoyerRapport(rapportId, u.id);
  revalidatePath("/", "layout");
}

/**
 * Reprendre en un clic une ligne d'un de mes rapports précédents (ce qui était prévu la semaine
 * dernière) dans le brouillon de cette semaine, dans la partie choisie.
 */
export async function reprendreLigne(rapportId: string, ligneId: string, partie: Partie) {
  const { u } = await monBrouillon(rapportId);
  if (!PARTIES.includes(partie)) return;
  const [l] = await db
    .select({ texte: schema.lignesRapport.texte, projetId: schema.lignesRapport.projetId, tacheId: schema.lignesRapport.tacheId, auteurId: schema.rapportsHebdo.auteurId })
    .from(schema.lignesRapport)
    .innerJoin(schema.rapportsHebdo, eq(schema.rapportsHebdo.id, schema.lignesRapport.rapportId))
    .where(eq(schema.lignesRapport.id, ligneId));
  if (!l || l.auteurId !== u.id) return; // seulement mes propres lignes
  const [{ m }] = await db.select({ m: max(schema.lignesRapport.ordre) }).from(schema.lignesRapport).where(eq(schema.lignesRapport.rapportId, rapportId));
  await db.insert(schema.lignesRapport).values({ rapportId, partie, texte: l.texte, projetId: l.projetId, tacheId: l.tacheId, ordre: (m ?? 0) + 1 });
  revalidatePath("/rapport");
}
