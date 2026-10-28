"use server";

import { revalidatePath } from "next/cache";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { ecrireMessage } from "@/lib/donnees/rapport";

export type EtatReponse = { n: number; erreur?: string };

/** « Répondre » : un mot sur un rapport envoyé (son auteur et ceux qui le lisent en entier). */
export async function repondreAuRapport(rapportId: string, prec: EtatReponse, form: FormData): Promise<EtatReponse> {
  const u = await exigerInterne();
  if (!/^[0-9a-f-]{36}$/.test(rapportId)) return { n: prec.n, erreur: "Rapport introuvable." };
  const r = await ecrireMessage(await acces(u), rapportId, String(form.get("texte") ?? ""));
  if (!r.ok) return { n: prec.n, erreur: r.erreur };
  revalidatePath(`/rapports/${rapportId}`);
  revalidatePath("/", "layout");
  return { n: prec.n + 1 };
}
