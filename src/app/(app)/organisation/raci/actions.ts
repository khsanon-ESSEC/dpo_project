"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { enregistrerRaciType } from "@/lib/donnees/raci";
import { RACI_DPO } from "@/lib/raci";

/** Organisation → RACI : le RACI type de la DPO (les droits sont vérifiés dans enregistrerRaciType). */
export async function enregistrerLeRaciType(form: FormData) {
  const u = await exigerUtilisateur();
  const r = await enregistrerRaciType(await acces(u), String(form.get("raci") ?? ""));
  revalidatePath("/organisation/raci");
  revalidatePath("/projets", "layout");
  if ("erreur" in r) redirect(`/organisation/raci?erreur=${encodeURIComponent(r.erreur)}`);
  redirect(`/organisation/raci?ok=1${r.avertissements.length ? `&attention=${encodeURIComponent(r.avertissements.join(" "))}` : ""}`);
}

/** Reprendre le tableau d'origine (celui de la note de cadrage). */
export async function reprendreLeRaciDOrigine() {
  const u = await exigerUtilisateur();
  const r = await enregistrerRaciType(await acces(u), RACI_DPO);
  revalidatePath("/organisation/raci");
  revalidatePath("/projets", "layout");
  redirect(`/organisation/raci${"erreur" in r ? `?erreur=${encodeURIComponent(r.erreur)}` : "?ok=1"}`);
}
