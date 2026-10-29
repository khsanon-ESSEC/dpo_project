"use server";

/** Kit de démarrage d'un projet (29 octobre 2026). Les droits sont vérifiés dans src/lib/donnees/kit.ts. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { appliquerKit, ecarterKit } from "@/lib/donnees/kit";

const UUID = /^[0-9a-f-]{36}$/;

async function exigerVisible(projetId: string) {
  if (!UUID.test(projetId)) throw new Error("Projet introuvable.");
  const a = await acces(await exigerUtilisateur());
  await exigerProjetVisible(a, projetId);
  return a;
}

/** « Ajouter au projet » : les éléments cochés. Retour sur la fiche du projet, avec ce qui a été ajouté. */
export async function utiliserLeKit(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  const choisis = new Set(form.getAll("choix").map(String));
  if (!choisis.size) redirect(`/projets/${projetId}/kit?erreur=${encodeURIComponent("Cochez au moins un élément, ou choisissez « Ne pas utiliser le kit ».")}`);
  const r = await appliquerKit(a, projetId, choisis);
  revalidatePath(`/projets/${projetId}`, "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}/kit?erreur=${encodeURIComponent(r.erreur)}`);
  const b = r.bilan;
  redirect(`/projets/${projetId}?kit=${[b.phases, b.livrables, b.risques, b.benefices, b.personnes].join("-")}`);
}

/** « Ne pas utiliser le kit » : la fiche du projet ne le propose plus. */
export async function ecarterLeKit(projetId: string) {
  const a = await exigerVisible(projetId);
  const r = await ecarterKit(a, projetId);
  revalidatePath(`/projets/${projetId}`, "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}`);
  redirect(`/projets/${projetId}`);
}
