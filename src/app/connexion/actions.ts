"use server";

import { redirect } from "next/navigation";
import { verifierIdentifiants } from "@/lib/auth/session";

/** `courriel` revient avec l'erreur pour ne pas avoir à le retaper (le formulaire se vide après chaque envoi). */
export type EtatConnexion = { message: string | null; courriel?: string };

export async function seConnecter(_: EtatConnexion, form: FormData): Promise<EtatConnexion> {
  const courriel = String(form.get("courriel") ?? "").trim().slice(0, 200);
  const r = await verifierIdentifiants(courriel, String(form.get("motDePasse") ?? ""));
  if (!r.ok) return { message: r.message, courriel };
  redirect("/semaine");
}
