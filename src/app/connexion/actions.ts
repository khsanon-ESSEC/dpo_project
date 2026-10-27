"use server";

import { redirect } from "next/navigation";
import { verifierIdentifiants } from "@/lib/auth/session";

export type EtatConnexion = { message: string | null };

export async function seConnecter(_: EtatConnexion, form: FormData): Promise<EtatConnexion> {
  const r = await verifierIdentifiants(String(form.get("courriel") ?? ""), String(form.get("motDePasse") ?? ""));
  if (!r.ok) return { message: r.message };
  redirect("/semaine");
}
