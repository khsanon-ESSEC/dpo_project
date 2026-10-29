"use server";

/** Objectifs, bénéfices et RACI d'un projet (29 octobre 2026). Les droits sont vérifiés dans src/lib/donnees. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterObjectif, modifierObjectif, noterConstat, retirerObjectif } from "@/lib/donnees/objectifs";
import { enregistrerRaciProjet, revenirAuRaciType } from "@/lib/donnees/raci";

const UUID = /^[0-9a-f-]{36}$/;

async function exigerVisible(projetId: string) {
  if (!UUID.test(projetId)) throw new Error("Projet introuvable.");
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, projetId);
  return a;
}

const saisie = (form: FormData) => ({ libelle: form.get("libelle"), indicateur: form.get("indicateur"), depart: form.get("depart"), cible: form.get("cible") });

/** Après une action sur la page Modifier : retour à la section, avec le message. */
function apres(projetId: string, r: { erreur: string } | { ok: true }, ancre: string, fait: string, page: "modifier" | "fiche" = "modifier"): never {
  revalidatePath(`/projets/${projetId}`, "layout");
  const base = page === "modifier" ? `/projets/${projetId}/modifier` : `/projets/${projetId}`;
  redirect("erreur" in r ? `${base}?erreur=${encodeURIComponent(r.erreur)}#${ancre}` : `${base}?fait=${fait}#${ancre}`);
}

export async function ajouterUnObjectif(projetId: string, genre: "objectif" | "benefice", form: FormData) {
  const a = await exigerVisible(projetId);
  apres(projetId, await ajouterObjectif(a, projetId, genre, saisie(form)), "objectifs", genre === "objectif" ? "objectif" : "benefice");
}

export async function modifierUnObjectif(projetId: string, id: string, form: FormData) {
  const a = await exigerVisible(projetId);
  if (!UUID.test(id)) return;
  apres(projetId, await modifierObjectif(a, projetId, id, saisie(form)), "objectifs", "objectif-modifie");
}

export async function retirerUnObjectif(projetId: string, id: string) {
  const a = await exigerVisible(projetId);
  if (!UUID.test(id)) return;
  apres(projetId, await retirerObjectif(a, projetId, id), "objectifs", "objectif-retire");
}

/** Valeur constatée d'un bénéfice : depuis la fiche du projet (aussi après la clôture). */
export async function noterLeConstat(projetId: string, id: string, form: FormData) {
  const a = await exigerVisible(projetId);
  if (!UUID.test(id)) return;
  apres(projetId, await noterConstat(a, projetId, id, form.get("constate")), "objectifs", "constat", "fiche");
}

export async function enregistrerLeRaci(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  const r = await enregistrerRaciProjet(a, projetId, String(form.get("raci") ?? ""));
  if ("ok" in r && r.avertissements.length) {
    revalidatePath(`/projets/${projetId}`, "layout");
    redirect(`/projets/${projetId}/modifier?fait=raci&attention=${encodeURIComponent(r.avertissements.join(" "))}#raci`);
  }
  apres(projetId, r, "raci", "raci");
}

export async function adapterLeRaci(projetId: string) {
  const a = await exigerVisible(projetId);
  apres(projetId, await enregistrerRaciProjet(a, projetId), "raci", "raci-adapte");
}

export async function revenirAuRaci(projetId: string) {
  const a = await exigerVisible(projetId);
  apres(projetId, await revenirAuRaciType(a, projetId), "raci", "raci-type");
}
