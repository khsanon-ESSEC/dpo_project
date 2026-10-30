"use server";

/** Noter ou retirer une absence depuis le profil ou la fiche d'une personne (règles : src/lib/donnees/absences.ts). */
import { revalidatePath } from "next/cache";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { noterAbsence, retirerAbsence } from "@/lib/donnees/absences";

export type EtatAbsence = { n: number; message?: string; erreur?: string };

export async function ajouterAbsence(personneId: string, etat: EtatAbsence, form: FormData): Promise<EtatAbsence> {
  const u = await exigerUtilisateur();
  const debut = String(form.get("debut") ?? "");
  const r = await noterAbsence(await acces(u), { personneId, debut, fin: String(form.get("fin") ?? "") || debut, motif: String(form.get("motif") ?? "") });
  if ("erreur" in r) return { n: etat.n, erreur: r.erreur };
  revalidatePath("/", "layout");
  return { n: etat.n + 1, message: r.message };
}

export async function enleverAbsence(id: string) {
  const u = await exigerUtilisateur();
  await retirerAbsence(await acces(u), id);
  revalidatePath("/", "layout");
}
