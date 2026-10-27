"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { creerPersonne, definirChefEquipe, modifierPersonne, reinitialiserMotDePasse } from "@/lib/donnees/organisation";
import { peutAdministrer } from "@/lib/regles";

async function exigerAdministrateur() {
  const u = await exigerUtilisateur();
  if (!peutAdministrer(u)) throw new Error("Réservé aux administrateurs.");
  return u;
}

const ou = (v: FormDataEntryValue | null) => (v ? String(v) : null);
/** Heures disponibles par semaine pour les tâches : de 0 à 60, 40 par défaut. */
const capacite = (v: FormDataEntryValue | null) => {
  const n = Math.round(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : 40;
};

export type EtatFiche = { message: string | null; ok?: boolean; provisoire?: string };

export async function enregistrerPersonne(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  const id = String(form.get("personneId") ?? "");
  try {
    await modifierPersonne(u.id, id, {
      equipeId: ou(form.get("equipeId")),
      superieurId: ou(form.get("superieurId")),
      poste: String(form.get("poste") ?? ""),
      directeur: form.get("directeur") === "on",
      executif: form.get("executif") === "on",
      administrateur: form.get("administrateur") === "on",
      capaciteHeures: capacite(form.get("capaciteHeures")),
      actif: form.get("actif") === "on",
    });
  } catch (e) {
    return { message: (e as Error).message };
  }
  revalidatePath("/organisation");
  return { message: "Enregistré.", ok: true };
}

export async function nouveauMotDePasse(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  const provisoire = await reinitialiserMotDePasse(u.id, String(form.get("personneId") ?? ""));
  return { message: null, ok: true, provisoire };
}

export async function ajouterPersonne(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  const courriel = String(form.get("courriel") ?? "").trim();
  const prenom = String(form.get("prenom") ?? "").trim();
  const nom = String(form.get("nom") ?? "").trim();
  if (!prenom || !nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) return { message: "Prénom, nom et adresse courriel valides sont nécessaires." };
  try {
    const { provisoire } = await creerPersonne(u.id, {
      prenom,
      nom,
      courriel,
      poste: String(form.get("poste") ?? ""),
      equipeId: ou(form.get("equipeId")),
      superieurId: ou(form.get("superieurId")),
      directeur: form.get("directeur") === "on",
      executif: form.get("executif") === "on",
      administrateur: form.get("administrateur") === "on",
    });
    revalidatePath("/organisation");
    return { message: null, ok: true, provisoire };
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("unique") || m.includes("duplicate")) return { message: "Cette adresse courriel existe déjà." };
    return { message: m.startsWith("Seul") ? m : "Création impossible." };
  }
}

export async function changerChefEquipe(equipeId: string, form: FormData) {
  const u = await exigerAdministrateur();
  await definirChefEquipe(u.id, equipeId, ou(form.get("chefId")));
  revalidatePath("/organisation");
  redirect("/organisation");
}
