"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { creerPersonne, definirChefEquipe, modifierPersonne, REFUS_SUIVI, reinitialiserMotDePasse } from "@/lib/donnees/organisation";
import { fermerAccesExterne, fusionnerExternes, modifierExterne, ouvrirAccesExterne } from "@/lib/donnees/externes";
import { peutAdministrer } from "@/lib/regles";
import { personneActuelle } from "@/lib/organisation";

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
  const personneId = String(form.get("personneId") ?? "");
  // L'accès d'une personne hors division s'ouvre et se ferme dans sa fiche « Hors division ».
  if ((await personneActuelle(personneId))?.externe) return { message: "Cette personne est hors division : ouvrez son accès depuis sa fiche." };
  try {
    const provisoire = await reinitialiserMotDePasse(u.id, personneId);
    return { message: null, ok: true, provisoire };
  } catch (e) {
    return { message: (e as Error).message };
  }
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
    return { message: m.startsWith("Seul") || m.startsWith("Le supérieur") ? m : "Création impossible." };
  }
}

export async function changerChefEquipe(equipeId: string, form: FormData) {
  const u = await exigerAdministrateur();
  let refus: string | null = null;
  try {
    await definirChefEquipe(u.id, equipeId, ou(form.get("chefId")));
  } catch (e) {
    // Un code, jamais le texte dans l'adresse : la page affiche son propre message.
    refus = (e as Error).message === REFUS_SUIVI ? "suivi" : "chef";
  }
  if (refus) redirect(`/organisation?erreur=${refus}`);
  revalidatePath("/organisation");
  redirect("/organisation");
}

// ---------- Personnes hors division ----------

export async function enregistrerExterne(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  try {
    await modifierExterne(u.id, String(form.get("personneId") ?? ""), {
      prenom: String(form.get("prenom") ?? ""),
      nom: String(form.get("nom") ?? ""),
      organisation: String(form.get("organisation") ?? ""),
      poste: String(form.get("poste") ?? ""),
      courriel: String(form.get("courriel") ?? ""),
      actif: form.get("actif") === "on",
    });
  } catch (e) {
    return { message: (e as Error).message };
  }
  revalidatePath("/organisation");
  return { message: "Enregistré.", ok: true };
}

export async function changerAccesExterne(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  const id = String(form.get("personneId") ?? "");
  try {
    if (form.get("ouvrir") === "1") {
      const provisoire = await ouvrirAccesExterne(u.id, id);
      revalidatePath("/organisation");
      return { message: "Accès ouvert : transmettez-lui son adresse et ce mot de passe provisoire.", ok: true, provisoire };
    }
    await fermerAccesExterne(u.id, id);
  } catch (e) {
    return { message: (e as Error).message };
  }
  revalidatePath("/organisation");
  return { message: "Accès fermé.", ok: true };
}

export async function fusionnerExterne(_: EtatFiche, form: FormData): Promise<EtatFiche> {
  const u = await exigerAdministrateur();
  const cible = String(form.get("cibleId") ?? "");
  if (!cible) return { message: "Choisissez la fiche à garder." };
  if (form.get("confirme") !== "on") return { message: "Cochez « Oui, fusionner » pour confirmer." };
  try {
    await fusionnerExternes(u.id, String(form.get("personneId") ?? ""), cible);
  } catch (e) {
    return { message: (e as Error).message };
  }
  revalidatePath("/organisation");
  redirect(`/organisation?p=${cible}`);
}
