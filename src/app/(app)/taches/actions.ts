"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerTacheVisible, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { noter } from "@/lib/journal";
import { retourValide } from "@/lib/retour";

type Statut = "a_faire" | "en_cours" | "bloquee" | "faite";
const STATUTS: Statut[] = ["a_faire", "en_cours", "bloquee", "faite"];

const lireDate = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
/** Estimation en heures : entier de 1 à 400, sinon vide. */
const lireHeures = (v: FormDataEntryValue | null) => {
  const n = Math.round(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= 1 && n <= 400 ? n : null;
};

async function changerStatut(tacheId: string, statut: Statut, auteurId: string, blocage?: string | null) {
  const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, tacheId));
  if (!t) return;
  const changeStatut = t.statut !== statut;
  await db
    .update(schema.taches)
    .set({
      statut,
      blocage: statut === "bloquee" ? (blocage ?? t.blocage) : null,
      termineeLe: statut === "faite" ? (t.termineeLe ?? new Date()) : null,
      majLe: new Date(),
    })
    .where(eq(schema.taches.id, tacheId));
  if (changeStatut) await db.insert(schema.evenementsTache).values({ tacheId, auteurId, type: "statut", avant: t.statut, apres: statut, note: statut === "bloquee" ? blocage ?? null : null });
  else if (statut === "bloquee" && blocage && blocage !== t.blocage) await db.insert(schema.evenementsTache).values({ tacheId, auteurId, type: "blocage", note: blocage });
  return t;
}

/** Case ronde : faite ↔ état précédent. */
export async function basculerTache(tacheId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  if (t.statut === "faite") {
    const [dernier] = await db
      .select({ avant: schema.evenementsTache.avant })
      .from(schema.evenementsTache)
      .where(and(eq(schema.evenementsTache.tacheId, tacheId), eq(schema.evenementsTache.type, "statut"), eq(schema.evenementsTache.apres, "faite")))
      .orderBy(desc(schema.evenementsTache.creeLe))
      .limit(1);
    const precedent = STATUTS.includes(dernier?.avant as Statut) && dernier?.avant !== "faite" ? (dernier!.avant as Statut) : "a_faire";
    await changerStatut(tacheId, precedent, u.id);
  } else {
    await changerStatut(tacheId, "faite", u.id);
  }
  revalidatePath("/", "layout");
}

export type EtatTache = { message: string | null; ok?: boolean };

export async function enregistrerTache(_: EtatTache, form: FormData): Promise<EtatTache> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const tacheId = String(form.get("tacheId") ?? "");
  const t = await exigerTacheVisible(a, tacheId);
  const statut = String(form.get("statut") ?? "") as Statut;
  if (!STATUTS.includes(statut)) return { message: "Choisissez un état." };
  const blocage = String(form.get("blocage") ?? "").trim().slice(0, 1000) || null;
  if (statut === "bloquee" && !blocage) return { message: "Dites en une phrase ce qui bloque." };
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const echeance = String(form.get("echeance") ?? "").trim();
  const debut = lireDate(form.get("debut"));
  const estimation = lireHeures(form.get("estimationHeures"));
  if (debut && echeance && debut > echeance) return { message: "Le début doit précéder l'échéance." };

  await changerStatut(tacheId, statut, u.id, blocage);
  if (echeance && /^\d{4}-\d{2}-\d{2}$/.test(echeance) && echeance !== t.echeance) {
    await db.update(schema.taches).set({ echeance }).where(eq(schema.taches.id, tacheId));
    await db.insert(schema.evenementsTache).values({ tacheId, auteurId: u.id, type: "echeance", avant: t.echeance, apres: echeance });
  }
  if (debut !== t.debut || estimation !== t.estimationHeures) {
    await db.update(schema.taches).set({ debut, estimationHeures: estimation }).where(eq(schema.taches.id, tacheId));
  }
  if (note) await db.insert(schema.evenementsTache).values({ tacheId, auteurId: u.id, type: "note", note });

  if (statut === "bloquee" && form.get("prevenir") === "on" && t.projetId) {
    const [p] = await db.select({ chef: schema.projets.chefProjetId, titre: schema.projets.titre }).from(schema.projets).where(eq(schema.projets.id, t.projetId));
    if (p?.chef && p.chef !== u.id) {
      await db.insert(schema.notifications).values({ personneId: p.chef, type: "blocage", texte: `${u.prenom} ${u.nom} est bloqué(e) sur « ${t.titre} » (${p.titre})`, lien: `/taches/${t.id}` });
    }
  }
  await noter(u.id, "tache_modifiee", tacheId, { statut });
  revalidatePath("/", "layout");
  redirect(retourValide(form.get("retour")) ?? "/semaine");
}

export type EtatNouvelleTache = { message: string | null };

export async function creerTache(_: EtatNouvelleTache, form: FormData): Promise<EtatNouvelleTache> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const titre = String(form.get("titre") ?? "").trim().slice(0, 200);
  const projetId = String(form.get("projetId") ?? "") || null;
  const assigneId = String(form.get("assigneId") ?? "") || u.id;
  const echeance = lireDate(form.get("echeance"));
  const debut = lireDate(form.get("debut"));
  const estimationHeures = lireHeures(form.get("estimationHeures"));
  if (!titre) return { message: "Donnez un titre à la tâche." };
  if (debut && echeance && debut > echeance) return { message: "Le début doit précéder l'échéance." };
  // On assigne une tâche à soi, à une personne de son équipe, ou sur un projet qu'on dirige.
  if (!suitPersonne(a, assigneId) && !(projetId && a.projetsDiriges.has(projetId))) return { message: "Vous ne pouvez pas assigner une tâche à cette personne." };
  const [t] = await db
    .insert(schema.taches)
    .values({ titre, projetId, assigneId, echeance, debut, estimationHeures, creeParId: u.id })
    .returning({ id: schema.taches.id });
  await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: u.id, type: "creation" });
  if (assigneId !== u.id) {
    await db.insert(schema.notifications).values({ personneId: assigneId, type: "tache", texte: `${u.prenom} ${u.nom} vous a confié « ${titre} »`, lien: `/taches/${t.id}` });
  }
  revalidatePath("/", "layout");
  redirect(retourValide(form.get("retour")) ?? "/semaine");
}

/** Tableau d'un projet : déplacer une carte vers une autre colonne. « Bloquée » passe par la fiche de la tâche (il faut dire ce qui bloque). */
export async function deplacerTache(tacheId: string, statut: string): Promise<{ ok: boolean; message?: string }> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  if (statut !== "a_faire" && statut !== "en_cours" && statut !== "faite") return { ok: false, message: "Pour une tâche bloquée, dites ce qui bloque sur sa fiche." };
  await changerStatut(tacheId, statut, u.id);
  await noter(u.id, "tache_deplacee", tacheId, { statut });
  if (t.projetId) revalidatePath(`/projets/${t.projetId}`, "layout");
  return { ok: true };
}
