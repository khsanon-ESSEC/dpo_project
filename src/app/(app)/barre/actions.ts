"use server";

/**
 * Actions de la barre qui ne sont ni une tâche ni une réunion : une note pour le rapport du vendredi, la mise
 * à jour d'un projet par son chef, et « Annuler » juste après une action. La saisie est toujours relue ici.
 */
import { revalidatePath } from "next/cache";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { annulerAction } from "@/lib/donnees/annulations";
import { ajouterNoteAuRapport, mettreAJourProjetDepuisBarre } from "@/lib/donnees/barre";
import { executerCommande } from "@/lib/donnees/commandes";
import { ajouterTacheRapide, mettreAJourTacheRapide } from "@/app/(app)/taches/actions";
import { noterReunionRapide } from "@/app/(app)/reunions/actions";

export type EtatBarre = { message: string | null; ok?: boolean; n?: number; annulation?: string; lien?: string };


export async function noterPourRapport(etat: EtatBarre, form: FormData): Promise<EtatBarre> {
  const u = await exigerUtilisateur();
  const r = await ajouterNoteAuRapport(u, { saisie: String(form.get("saisie") ?? ""), projetId: String(form.get("projetId") ?? "") });
  if (r.ok) revalidatePath("/rapport");
  return { ...r, n: r.ok ? (etat.n ?? 0) + 1 : etat.n };
}

export async function majProjetRapide(etat: EtatBarre, form: FormData): Promise<EtatBarre> {
  const u = await exigerUtilisateur();
  const r = await mettreAJourProjetDepuisBarre(u, await acces(u), { saisie: String(form.get("saisie") ?? ""), projetId: String(form.get("projetId") ?? "") });
  if (r.ok && r.projetId) {
    revalidatePath(`/projets/${r.projetId}`, "layout");
    revalidatePath("/projets");
  }
  return { message: r.message, ok: r.ok, annulation: r.annulation, lien: r.lien, n: r.ok ? (etat.n ?? 0) + 1 : etat.n };
}

/**
 * Point d'entrée unique de la barre : la page dit de quoi parle la ligne (« genre »), chaque action relit la
 * saisie et applique ses propres règles. Tous rendent le même état (message, lien, annulation).
 */
/** Une action reconnue par la barre (src/lib/commandes.ts) : la phrase est relue et les droits vérifiés côté serveur. */
export async function commandeRapide(etat: EtatBarre, form: FormData): Promise<EtatBarre> {
  const u = await exigerUtilisateur();
  const r = await executerCommande(u, await acces(u), { saisie: String(form.get("saisie") ?? ""), projetId: String(form.get("projetId") ?? "") });
  if (r.ok) revalidatePath("/", "layout");
  return { message: r.message, ok: r.ok, annulation: r.annulation, lien: r.lien, n: r.ok ? (etat.n ?? 0) + 1 : etat.n };
}

export async function executerBarre(etat: EtatBarre, form: FormData): Promise<EtatBarre> {
  const genre = String(form.get("genre") ?? "tache");
  // Une question (sur les données ou pour le guide) ne modifie rien : elle ne devient jamais une tâche.
  if (genre === "question" || genre === "guide") return { message: null, n: etat.n };
  if (genre === "commande") return commandeRapide(etat, form);
  if (genre === "note") return noterPourRapport(etat, form);
  if (genre === "projet") return majProjetRapide(etat, form);
  if (genre === "reunion") {
    const r = await noterReunionRapide({ message: null, n: etat.n }, form);
    return { message: r.message, ok: r.ok, n: r.n, annulation: r.annulation, lien: r.ok && r.semaine ? `/reunions?semaine=${r.semaine}` : undefined };
  }
  if (genre === "maj") {
    const r = await mettreAJourTacheRapide({ message: null, n: etat.n }, form);
    return { message: r.message, ok: r.ok, n: r.n, annulation: r.annulation, lien: r.ok && r.id ? `/taches/${r.id}` : undefined };
  }
  const r = await ajouterTacheRapide({ message: null, n: etat.n }, form);
  return { message: r.message, ok: r.ok, n: r.n, annulation: r.annulation, lien: r.ok && r.id ? `/taches/${r.id}` : undefined };
}

/** « Annuler » juste après une action de la barre. */
export async function annulerDepuisBarre(id: string): Promise<{ ok: boolean; message: string }> {
  const u = await exigerUtilisateur();
  const r = await annulerAction(await acces(u), String(id ?? ""));
  revalidatePath("/", "layout");
  return "erreur" in r ? { ok: false, message: r.erreur } : { ok: true, message: r.message };
}
