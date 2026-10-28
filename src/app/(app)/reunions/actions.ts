"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acces, contactsVisibles, idsProjetsVisibles, type Acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { lundiDe } from "@/lib/dates";
import { modifierReunion, noterReunion, quitterReunion, supprimerReunion, type SaisieReunion } from "@/lib/donnees/reunions";
import { trouverOuCreerExterne } from "@/lib/donnees/externes";
import { creerTacheGeree } from "@/lib/donnees/gestion";

const UUID = /^[0-9a-f-]{36}$/;

/** Les personnes hors division ajoutées dans le formulaire (« externes » : {nom, organisation} en JSON) : leurs fiches. */
async function avecExternes(form: FormData, d: SaisieReunion, parId: string): Promise<SaisieReunion> {
  const ids: string[] = [];
  for (const brut of form.getAll("externes").slice(0, 30)) {
    try {
      const e = JSON.parse(String(brut)) as { nom?: string; organisation?: string };
      const id = await trouverOuCreerExterne(String(e.nom ?? ""), String(e.organisation ?? ""), parId);
      if (id) ids.push(id);
    } catch {
      /* entrée illisible : ignorée */
    }
  }
  return ids.length ? { ...d, participants: [...d.participants, ...ids] } : d;
}

const saisie = (form: FormData): SaisieReunion => ({
  titre: String(form.get("titre") ?? ""),
  jour: String(form.get("jour") ?? ""),
  heure: String(form.get("heure") ?? ""),
  dureeMinutes: form.get("duree"),
  projetId: String(form.get("projetId") ?? ""),
  notes: String(form.get("notes") ?? ""),
  participants: form.getAll("participants").map(String).filter((id) => UUID.test(id)),
});

/**
 * Hors division (accès limité) : on ne note une réunion qu'avec des personnes avec qui l'on travaille déjà,
 * et l'on ne crée pas de nouvelle fiche hors division.
 */
async function bornerPourExterne(a: Acces, form: FormData, d: SaisieReunion): Promise<SaisieReunion> {
  if (!a.moi.externe) return avecExternes(form, d, a.moi.id);
  const contacts = await contactsVisibles(a);
  return { ...d, participants: d.participants.filter((id) => contacts.has(id)) };
}

/**
 * Actions décidées en réunion (« actionTitre », « actionPour », « actionEcheance », alignés) : chacune devient
 * une tâche rattachée à la réunion et à son projet, avec les règles d'assignation habituelles.
 * Renvoie un message pour la page, ou null si tout est créé.
 */
async function creerActions(a: Acces, form: FormData, reunionId: string, projetId: string | null): Promise<{ creees: number; refus: string[] }> {
  const titres = form.getAll("actionTitre").map(String).slice(0, 10);
  const pour = form.getAll("actionPour").map(String);
  const echeances = form.getAll("actionEcheance").map(String);
  let creees = 0;
  const refus: string[] = [];
  for (const [i, brut] of titres.entries()) {
    const titre = brut.trim();
    if (!titre) continue;
    const assigneId = UUID.test(pour[i] ?? "") ? pour[i] : a.moi.id;
    const echeance = /^\d{4}-\d{2}-\d{2}$/.test(echeances[i] ?? "") ? echeances[i] : null;
    const r = await creerTacheGeree(a, { titre, description: "", projetId, assigneId, echeance, debut: null, estimationHeures: null, reunionId });
    if ("erreur" in r) refus.push(`« ${titre.slice(0, 60)} » : ${r.erreur}`);
    else creees += 1;
  }
  return { creees, refus };
}

const messageActions = (r: { creees: number; refus: string[] }) =>
  [r.creees ? `${r.creees} action${r.creees > 1 ? "s" : ""} ajoutée${r.creees > 1 ? "s" : ""} aux tâches.` : "", r.refus.length ? `Non créée${r.refus.length > 1 ? "s" : ""} : ${r.refus.join(" ; ")}` : ""].filter(Boolean).join(" ");

const semaineDe = (jour: string) => (/^\d{4}-\d{2}-\d{2}$/.test(jour) ? lundiDe(jour) : "");

const revalider = () => {
  revalidatePath("/reunions");
  revalidatePath("/semaine");
  revalidatePath("/rapport");
  revalidatePath("/a-faire");
};

export async function noter(form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const d = await bornerPourExterne(a, form, saisie(form));
  const r = await noterReunion(a, d, await idsProjetsVisibles(a));
  const s = semaineDe(d.jour);
  if ("erreur" in r) {
    revalider();
    redirect(`/reunions?${s ? `semaine=${s}&` : ""}erreur=${encodeURIComponent(r.erreur)}#noter`);
  }
  const act = await creerActions(a, form, r.id, UUID.test(d.projetId) ? d.projetId : null);
  revalider();
  const m = messageActions(act);
  redirect(`/reunions?semaine=${s}&notee=1${m ? `&${act.refus.length ? "erreur" : "info"}=${encodeURIComponent(m)}` : ""}`);
}

export async function modifier(id: string, form: FormData) {
  if (!UUID.test(id)) return;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const d = await bornerPourExterne(a, form, saisie(form));
  const r = await modifierReunion(a, id, d, await idsProjetsVisibles(a));
  const s = semaineDe(d.jour);
  if ("erreur" in r) {
    revalider();
    redirect(`/reunions?${s ? `semaine=${s}&` : ""}modifier=${id}&erreur=${encodeURIComponent(r.erreur)}#noter`);
  }
  const act = await creerActions(a, form, id, UUID.test(d.projetId) ? d.projetId : null);
  revalider();
  const m = messageActions(act);
  redirect(`/reunions?semaine=${s}${m ? `&${act.refus.length ? "erreur" : "info"}=${encodeURIComponent(m)}` : ""}`);
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
