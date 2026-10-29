"use server";

/** État d'avancement du projet pour le rapport mensuel au conseil (29 octobre 2026). Droits : src/lib/donnees. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { enregistrerAvancement } from "@/lib/donnees/avancement-conseil";

export async function ecrireAvancementConseil(projetId: string, form: FormData) {
  if (!/^[0-9a-f-]{36}$/.test(projetId)) throw new Error("Projet introuvable.");
  const a = await acces(await exigerUtilisateur());
  await exigerProjetVisible(a, projetId);
  const r = await enregistrerAvancement(a, projetId, form.get("texte"));
  revalidatePath(`/projets/${projetId}`);
  revalidatePath("/conseil");
  redirect("erreur" in r ? `/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#conseil` : `/projets/${projetId}?fait=conseil#conseil`);
}
