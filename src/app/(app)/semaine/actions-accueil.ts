"use server";

import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/auth/session";
import { fermerAccueilDe } from "@/lib/donnees/accueil";

/** « Masquer » la carte « Vos trois premiers gestes ». */
export async function fermerAccueil() {
  const u = await exigerUtilisateur();
  await fermerAccueilDe(u.id);
  revalidatePath("/semaine");
}
