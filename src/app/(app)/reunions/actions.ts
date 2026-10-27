"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { lundiDe } from "@/lib/dates";
import { modifierReunion, noterReunion, quitterReunion, supprimerReunion, type SaisieReunion } from "@/lib/donnees/reunions";

const UUID = /^[0-9a-f-]{36}$/;

const saisie = (form: FormData): SaisieReunion => ({
  titre: String(form.get("titre") ?? ""),
  jour: String(form.get("jour") ?? ""),
  heure: String(form.get("heure") ?? ""),
  dureeMinutes: form.get("duree"),
  projetId: String(form.get("projetId") ?? ""),
  notes: String(form.get("notes") ?? ""),
  participants: form.getAll("participants").map(String).filter((id) => UUID.test(id)),
});

const semaineDe = (jour: string) => (/^\d{4}-\d{2}-\d{2}$/.test(jour) ? lundiDe(jour) : "");

const revalider = () => {
  revalidatePath("/reunions");
  revalidatePath("/semaine");
  revalidatePath("/rapport");
};

export async function noter(form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const d = saisie(form);
  const r = await noterReunion(a, d, await idsProjetsVisibles(a));
  revalider();
  const s = semaineDe(d.jour);
  if ("erreur" in r) redirect(`/reunions?${s ? `semaine=${s}&` : ""}erreur=${encodeURIComponent(r.erreur)}#noter`);
  redirect(`/reunions?semaine=${s}&notee=1`);
}

export async function modifier(id: string, form: FormData) {
  if (!UUID.test(id)) return;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const d = saisie(form);
  const r = await modifierReunion(a, id, d, await idsProjetsVisibles(a));
  revalider();
  const s = semaineDe(d.jour);
  if ("erreur" in r) redirect(`/reunions?${s ? `semaine=${s}&` : ""}modifier=${id}&erreur=${encodeURIComponent(r.erreur)}#noter`);
  redirect(`/reunions?semaine=${s}`);
}

export async function supprimer(id: string, semaine: string) {
  if (!UUID.test(id)) return;
  const u = await exigerUtilisateur();
  const r = await supprimerReunion(await acces(u), id);
  revalider();
  const s = semaineDe(semaine);
  redirect(`/reunions?${s ? `semaine=${s}` : ""}${"erreur" in r ? `&erreur=${encodeURIComponent(r.erreur)}` : ""}`);
}

export async function quitter(id: string, semaine: string) {
  if (!UUID.test(id)) return;
  const u = await exigerUtilisateur();
  const r = await quitterReunion(await acces(u), id);
  revalider();
  const s = semaineDe(semaine);
  redirect(`/reunions?${s ? `semaine=${s}` : ""}${"erreur" in r ? `&erreur=${encodeURIComponent(r.erreur)}` : ""}`);
}
