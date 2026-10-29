/**
 * La période choisie la dernière fois (préférence gardée par le navigateur, sans donnée personnelle) : une page
 * sans période dans son adresse s'ouvre sur celle-là, sinon sur sa période par défaut.
 */
import "server-only";
import { cookies } from "next/headers";
import { vueValide, type VueBilan } from "./bilan";

export async function periodePreferee(defaut: VueBilan): Promise<VueBilan> {
  return vueValide((await cookies()).get("dpo_periode")?.value) ?? defaut;
}
