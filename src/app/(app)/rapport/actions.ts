"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigerUtilisateur } from "@/lib/auth/session";
import { champDeRubrique, envoyerRapport, formulaireDe, ordreSuivant } from "@/lib/donnees/rapport";
import { RUBRIQUES, valeurAcceptable, type Rubrique } from "@/lib/modeles";

/** Le rapport doit appartenir à la personne connectée et être encore un brouillon. */
async function monBrouillon(rapportId: string) {
  const u = await exigerUtilisateur();
  const [r] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.id, rapportId), eq(schema.rapportsHebdo.auteurId, u.id), eq(schema.rapportsHebdo.statut, "brouillon")));
  if (!r) throw new Error("Rapport introuvable ou déjà envoyé.");
  return { u, r, f: formulaireDe(r) };
}

async function maLigne(ligneId: string) {
  const [l] = await db.select().from(schema.lignesRapport).where(eq(schema.lignesRapport.id, ligneId));
  if (!l) throw new Error("Ligne introuvable.");
  const b = await monBrouillon(l.rapportId);
  return { l, ...b };
}

export async function modifierLigne(ligneId: string, texte: string) {
  const { l } = await maLigne(ligneId);
  const t = texte.trim().slice(0, 500);
  if (!t) return supprimerLigne(ligneId);
  await db.update(schema.lignesRapport).set({ texte: t, proposeeParIa: false }).where(eq(schema.lignesRapport.id, l.id));
  revalidatePath("/rapport");
}

export async function changerProjetLigne(ligneId: string, projetId: string | null) {
  await maLigne(ligneId);
  await db.update(schema.lignesRapport).set({ projetId: projetId || null }).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

/** Une ligne à moi se supprime ; un élément reçu de l'équipe se retire (il ne reviendra pas). */
export async function supprimerLigne(ligneId: string) {
  const { l } = await maLigne(ligneId);
  if (l.origines.length) await db.update(schema.lignesRapport).set({ retiree: true, remonte: false }).where(eq(schema.lignesRapport.id, ligneId));
  else await db.delete(schema.lignesRapport).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

export async function remettreLigne(ligneId: string) {
  const { l } = await maLigne(ligneId);
  if (l.origines.length) await db.update(schema.lignesRapport).set({ retiree: false }).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

/** Rapport de chef : faire remonter un élément à décider dans le rapport de son supérieur. */
export async function basculerRemonte(ligneId: string) {
  const { l, f } = await maLigne(ligneId);
  const c = f.find((x) => x.id === l.champId);
  if (c?.type !== "reprise" || c.reprise !== "a_decider") return;
  await db.update(schema.lignesRapport).set({ remonte: !l.remonte, retiree: false }).where(eq(schema.lignesRapport.id, ligneId));
  revalidatePath("/rapport");
}

export async function ajouterLigne(rapportId: string, champId: string, form: FormData) {
  const { f } = await monBrouillon(rapportId);
  const c = f.find((x) => x.id === champId);
  if (!c || c.type !== "lignes" || c.partie === "equipe") return;
  const texte = String(form.get("texte") ?? "").trim().slice(0, 500);
  if (!texte) return;
  const projetId = c.parProjet === false ? null : String(form.get("projetId") ?? "") || null;
  await db.insert(schema.lignesRapport).values({ rapportId, champId, partie: c.rubrique && c.rubrique !== "autre" ? c.rubrique : null, texte, projetId, ordre: await ordreSuivant(rapportId) });
  revalidatePath("/rapport");
}

export async function basculerPartieRelue(rapportId: string, champId: string) {
  const { r, f } = await monBrouillon(rapportId);
  if (!f.some((c) => c.id === champId)) return;
  const relues = new Set(r.partiesRelues);
  if (relues.has(champId)) relues.delete(champId);
  else relues.add(champId);
  await db.update(schema.rapportsHebdo).set({ partiesRelues: [...relues], majLe: new Date() }).where(eq(schema.rapportsHebdo.id, rapportId));
  revalidatePath("/rapport");
}

/** Réponse à un champ autre qu'une liste (feu, charge, texte, choix, nombre, date). */
export async function repondre(rapportId: string, champId: string, projetId: string | null, valeur: string) {
  const { f } = await monBrouillon(rapportId);
  const c = f.find((x) => x.id === champId);
  if (!c) return;
  const cible = c.type === "reprise" && c.reprise === "sante" ? { ...c, type: "sante" as const } : c;
  if (c.type === "reprise" && c.reprise !== "sante") return;
  const v = valeurAcceptable(cible, String(valeur ?? ""));
  if (v === null) return;
  if (cible.type === "sante" && !projetId) return;
  await enregistrer(rapportId, champId, projetId, { valeur: v });
  revalidatePath("/rapport");
}

/** Feu : une phrase pour expliquer ce qui n'est pas « dans les temps ». */
export async function commenter(rapportId: string, champId: string, projetId: string | null, texte: string) {
  const { f } = await monBrouillon(rapportId);
  const c = f.find((x) => x.id === champId);
  if (!c || c.type !== "sante") return;
  await enregistrer(rapportId, champId, projetId, { commentaire: String(texte ?? "").trim().slice(0, 300) });
  revalidatePath("/rapport");
}

async function enregistrer(rapportId: string, champId: string, projetId: string | null, d: { valeur?: string; commentaire?: string }) {
  await db.transaction(async (tx) => {
    const cond = and(eq(schema.reponsesRapport.rapportId, rapportId), eq(schema.reponsesRapport.champId, champId), projetId ? eq(schema.reponsesRapport.projetId, projetId) : isNull(schema.reponsesRapport.projetId));
    const [x] = await tx.select({ id: schema.reponsesRapport.id }).from(schema.reponsesRapport).where(cond).limit(1);
    if (x) await tx.update(schema.reponsesRapport).set({ ...d, majLe: new Date() }).where(eq(schema.reponsesRapport.id, x.id));
    else await tx.insert(schema.reponsesRapport).values({ rapportId, champId, projetId, valeur: d.valeur ?? "", commentaire: d.commentaire ?? "" });
  });
  await db.update(schema.rapportsHebdo).set({ majLe: sql`now()` }).where(eq(schema.rapportsHebdo.id, rapportId));
}

export async function envoyer(rapportId: string) {
  const { u } = await monBrouillon(rapportId);
  const r = await envoyerRapport(rapportId, u.id);
  if (r && !r.ok) redirect("/rapport?envoi=incomplet#envoi");
  revalidatePath("/", "layout");
}

/**
 * Reprendre en un clic une ligne d'un de mes rapports précédents (ce qui était prévu la semaine
 * dernière) dans le brouillon de cette semaine, dans le champ de la rubrique choisie.
 */
export async function reprendreLigne(rapportId: string, ligneId: string, rubrique: Rubrique) {
  const { u, f } = await monBrouillon(rapportId);
  if (!RUBRIQUES.includes(rubrique)) return;
  const c = champDeRubrique(f, rubrique);
  if (!c) return;
  const [l] = await db
    .select({ texte: schema.lignesRapport.texte, projetId: schema.lignesRapport.projetId, tacheId: schema.lignesRapport.tacheId, auteurId: schema.rapportsHebdo.auteurId })
    .from(schema.lignesRapport)
    .innerJoin(schema.rapportsHebdo, eq(schema.rapportsHebdo.id, schema.lignesRapport.rapportId))
    .where(eq(schema.lignesRapport.id, ligneId));
  if (!l || l.auteurId !== u.id) return; // seulement mes propres lignes
  await db.insert(schema.lignesRapport).values({ rapportId, champId: c.id, partie: rubrique, texte: l.texte, projetId: c.parProjet === false ? null : l.projetId, tacheId: l.tacheId, ordre: await ordreSuivant(rapportId) });
  revalidatePath("/rapport");
}
