"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterValeur, changerEtatValeur, estGenreListe, peutGererListes, renommerValeur } from "@/lib/donnees/listes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function exigerGestionListes() {
  const u = await exigerUtilisateur();
  if (!peutGererListes(u, await acces(u))) throw new Error("Réservé aux administrateurs et aux exécutifs.");
  return u;
}

const retour = (r: { erreur: string } | { ok: true }, ancre: string) => {
  revalidatePath("/organisation/listes");
  revalidatePath("/projets", "layout");
  redirect(`/organisation/listes${"erreur" in r ? `?erreur=${encodeURIComponent(r.erreur)}` : "?ok=1"}#${ancre}`);
};

export async function ajouterALaListe(genre: string, form: FormData) {
  const u = await exigerGestionListes();
  if (!estGenreListe(genre)) throw new Error("Liste inconnue.");
  const r = await ajouterValeur(genre, form.get("libelle"), u.id);
  retour("erreur" in r ? r : { ok: true }, `liste-${genre}`);
}

export async function renommerDansLaListe(id: string, form: FormData) {
  const u = await exigerGestionListes();
  if (!UUID.test(id)) throw new Error("Valeur introuvable.");
  const r = await renommerValeur(id, form.get("libelle"), u.id);
  retour(r, `valeur-${id}`);
}

export async function retirerDeLaListe(id: string, actif: boolean) {
  const u = await exigerGestionListes();
  if (!UUID.test(id)) throw new Error("Valeur introuvable.");
  const r = await changerEtatValeur(id, actif, u.id);
  retour(r, `valeur-${id}`);
}
