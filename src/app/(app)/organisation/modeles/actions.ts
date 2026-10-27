"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { peutAdministrer } from "@/lib/regles";
import {
  abandonnerBrouillon,
  affecterEquipe,
  affecterPersonne,
  champsEnEdition,
  creerModele,
  enregistrerChamps,
  modifierHoraires,
  modifierModele,
  publierBrouillon,
  retirerAffectation,
} from "@/lib/donnees/modeles";
import { nouveauChamp, REPRISES, RUBRIQUES, TYPES_CHAMP, VISIBILITES, type Champ, type Reprise, type Rubrique, type TypeChamp, type Visibilite } from "@/lib/modeles";

/** Seuls les administrateurs configurent les modèles (décision du 27 octobre 2026). */
async function exigerAdmin() {
  const u = await exigerUtilisateur();
  if (!peutAdministrer(u)) notFound();
  return u;
}

const UUID = /^[0-9a-f-]{36}$/;
const chemin = (id: string, champ?: string | null, erreur?: string) => {
  const q = new URLSearchParams();
  if (champ) q.set("champ", champ);
  if (erreur) q.set("erreur", erreur);
  const s = q.toString();
  return `/organisation/modeles/${id}${s ? `?${s}` : ""}`;
};

async function enEdition(modeleId: string) {
  if (!UUID.test(modeleId)) notFound();
  const e = await champsEnEdition(modeleId);
  if (!e) notFound();
  return e;
}

export async function creer(form: FormData) {
  const u = await exigerAdmin();
  const genre = form.get("genre") === "chef" ? "chef" : "individuel";
  const depuis = String(form.get("depuis") ?? "");
  const r = await creerModele(String(form.get("nom") ?? ""), genre, UUID.test(depuis) ? depuis : null, u.id);
  if (r.erreur !== undefined) redirect(`/organisation/modeles?erreur=${encodeURIComponent(r.erreur)}`);
  redirect(`/organisation/modeles/${r.id}`);
}

/** Ajoute un champ à la position donnée (fin de liste si absente) et le sélectionne. */
export async function ajouterChamp(modeleId: string, type: TypeChamp, position: number | null) {
  const u = await exigerAdmin();
  const { champs } = await enEdition(modeleId);
  if (!TYPES_CHAMP.includes(type)) return;
  const c = nouveauChamp(type, champs.map((x) => x.id));
  const liste = [...champs];
  const i = position === null || position < 0 || position > liste.length ? liste.length : position;
  liste.splice(i, 0, c);
  const v = await enregistrerChamps(modeleId, liste, u.id);
  revalidatePath(`/organisation/modeles/${modeleId}`);
  redirect(chemin(modeleId, v.ok ? c.id : null, v.ok ? undefined : v.erreur));
}

/** Nouvel ordre des champs (glisser-déposer). */
export async function reordonner(modeleId: string, ids: string[]) {
  const u = await exigerAdmin();
  const { champs } = await enEdition(modeleId);
  if (ids.length !== champs.length || !ids.every((id) => champs.some((c) => c.id === id))) return;
  await enregistrerChamps(modeleId, ids.map((id) => champs.find((c) => c.id === id)!), u.id);
  revalidatePath(`/organisation/modeles/${modeleId}`);
}

/** Monter ou descendre un champ : l'alternative au glisser-déposer, au clavier. */
export async function deplacerChamp(modeleId: string, champId: string, sens: -1 | 1) {
  const u = await exigerAdmin();
  const { champs } = await enEdition(modeleId);
  const i = champs.findIndex((c) => c.id === champId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= champs.length) return;
  const liste = [...champs];
  [liste[i], liste[j]] = [liste[j], liste[i]];
  await enregistrerChamps(modeleId, liste, u.id);
  revalidatePath(`/organisation/modeles/${modeleId}`);
  redirect(chemin(modeleId, champId));
}

export async function retirerChamp(modeleId: string, champId: string) {
  const u = await exigerAdmin();
  const { champs } = await enEdition(modeleId);
  const i = champs.findIndex((c) => c.id === champId);
  if (i < 0) return;
  const liste = champs.filter((c) => c.id !== champId);
  const v = await enregistrerChamps(modeleId, liste, u.id);
  revalidatePath(`/organisation/modeles/${modeleId}`);
  redirect(chemin(modeleId, v.ok ? (liste[Math.min(i, liste.length - 1)]?.id ?? null) : champId, v.ok ? undefined : v.erreur));
}

/** Propriétés du champ sélectionné. */
export async function enregistrerChamp(modeleId: string, champId: string, form: FormData) {
  const u = await exigerAdmin();
  const { champs } = await enEdition(modeleId);
  const avant = champs.find((c) => c.id === champId);
  if (!avant) redirect(chemin(modeleId));
  const c: Champ = { id: avant.id, type: avant.type, libelle: String(form.get("libelle") ?? "") };
  const aide = String(form.get("aide") ?? "").trim();
  if (aide) c.aide = aide;
  if (form.get("obligatoire") === "on") c.obligatoire = true;
  const rubrique = String(form.get("rubrique") ?? "");
  if (RUBRIQUES.includes(rubrique as Rubrique)) c.rubrique = rubrique as Rubrique;
  c.prerempli = form.get("prerempli") === "on";
  c.parProjet = form.get("parProjet") === "on";
  const visibilite = String(form.get("visibilite") ?? "");
  if (VISIBILITES.includes(visibilite as Visibilite)) c.visibilite = visibilite as Visibilite;
  const reprise = String(form.get("reprise") ?? "");
  if (REPRISES.includes(reprise as Reprise)) c.reprise = reprise as Reprise;
  if (form.has("options")) c.options = String(form.get("options")).split(/\r?\n/).map((o) => o.trim()).filter(Boolean);
  const v = await enregistrerChamps(modeleId, champs.map((x) => (x.id === champId ? c : x)), u.id);
  revalidatePath(`/organisation/modeles/${modeleId}`);
  redirect(chemin(modeleId, champId, v.ok ? undefined : v.erreur) + (v.ok ? "#proprietes" : ""));
}

export async function publier(modeleId: string, form: FormData) {
  const u = await exigerAdmin();
  const r = await publierBrouillon(modeleId, String(form.get("note") ?? ""), u.id);
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId, null, "erreur" in r ? r.erreur : undefined));
}

export async function abandonner(modeleId: string) {
  const u = await exigerAdmin();
  await abandonnerBrouillon(modeleId, u.id);
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId));
}

export async function modifierReglages(modeleId: string, form: FormData) {
  const u = await exigerAdmin();
  const r = await modifierModele(
    modeleId,
    {
      nom: String(form.get("nom") ?? ""),
      description: String(form.get("description") ?? ""),
      actif: form.get("actif") === "on",
      parDefaut: form.get("parDefaut") === "on",
      pourChefs: form.get("pourChefs") === "on",
    },
    u.id,
  );
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId, null, "erreur" in r ? r.erreur : undefined) + "#reglages");
}

export async function affecterAEquipe(modeleId: string, equipeId: string) {
  const u = await exigerAdmin();
  if (!UUID.test(equipeId)) return;
  await affecterEquipe(modeleId, equipeId, u.id);
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId) + "#qui");
}

export async function affecterAPersonne(modeleId: string, form: FormData) {
  const u = await exigerAdmin();
  const personneId = String(form.get("personneId") ?? "");
  if (UUID.test(personneId)) await affecterPersonne(modeleId, personneId, u.id);
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId) + "#qui");
}

export async function retirer(modeleId: string, affectationId: string) {
  const u = await exigerAdmin();
  if (UUID.test(affectationId)) await retirerAffectation(affectationId, u.id);
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId) + "#qui");
}

/** Heures de la semaine : prêt à relire, rappel, à envoyer avant (rappel et heure limite peuvent être retirés). */
export async function modifierHorairesModele(modeleId: string, form: FormData) {
  const u = await exigerAdmin();
  if (!UUID.test(modeleId)) notFound();
  const moment = (cle: string) => ({ jour: Number(form.get(`${cle}_jour`)), heure: String(form.get(`${cle}_heure`) ?? "") });
  const r = await modifierHoraires(
    modeleId,
    { pret: moment("pret"), rappel: form.get("rappel_actif") === "on" ? moment("rappel") : null, limite: form.get("limite_actif") === "on" ? moment("limite") : null },
    u.id,
  );
  revalidatePath("/organisation/modeles", "layout");
  redirect(chemin(modeleId, null, "erreur" in r ? r.erreur : undefined) + "#horaires");
}
