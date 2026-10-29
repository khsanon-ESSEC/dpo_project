"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerTacheVisible, idsProjetsVisibles, peutModifierTache } from "@/lib/acces";
import { annulerTache, creerTacheGeree, modifierDefinitionTache, retablirTache, supprimerTache } from "@/lib/donnees/gestion";
import { ajouterDependance, prevenirSuivantes, retirerDependance } from "@/lib/donnees/dependances";
import { noterTemps, retirerTemps } from "@/lib/donnees/temps";
import { arreterRepetition, repeterTache } from "@/lib/donnees/recurrence";
import { lireDuree } from "@/lib/risques";
import { exigerUtilisateur } from "@/lib/auth/session";
import { noter } from "@/lib/journal";
import { enregistrerAnnulation } from "@/lib/donnees/annulations";
import { retourValide } from "@/lib/retour";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { analyserMiseAJour, analyserSaisie, LIBELLES_STATUT } from "@/lib/saisie-rapide";
// Constante prise dans un module partagé : un module « use client » ne s'importe pas dans une action serveur.
import { NOUVELLE_PERSONNE } from "@/lib/projets";

/** « Quelqu'un d'autre, hors division » choisi dans « Pour » : son nom et son département. */
const nouvelExterne = (form: FormData) =>
  String(form.get("assigneId") ?? "") === NOUVELLE_PERSONNE ? { nom: String(form.get("pourNomExterne") ?? ""), organisation: String(form.get("pourOrgExterne") ?? "") } : null;

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
  // Faite : les tâches qui l'attendaient peuvent commencer ; leurs personnes sont prévenues.
  if (changeStatut && statut === "faite") await prevenirSuivantes(tacheId, auteurId);
  return t;
}

/** Case ronde : faite ↔ état précédent. */
export async function basculerTache(tacheId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  // Une tâche annulée ne se coche plus : on la rétablit d'abord depuis sa fiche.
  if (t.annuleeLe) return;
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
  if (t.annuleeLe) return { message: "Cette tâche est annulée : rétablissez-la d'abord." };
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
    const [p] = await db.select({ chef: sql<string | null>`coalesce(${schema.projets.referentId}, ${schema.projets.chefProjetId})`, titre: schema.projets.titre }).from(schema.projets).where(eq(schema.projets.id, t.projetId));
    if (p?.chef && p.chef !== u.id) {
      await db.insert(schema.notifications).values({ personneId: p.chef, type: "blocage", texte: `${u.prenom} ${u.nom} est bloqué(e) sur « ${t.titre} » (${p.titre})`, lien: `/taches/${t.id}` });
    }
  }
  await noter(u.id, "tache_modifiee", tacheId, { statut });
  revalidatePath("/", "layout");
  redirect(retourValide(form.get("retour")) ?? "/semaine");
}

export type EtatNouvelleTache = { message: string | null };

/** Créer une tâche : on la confie à soi, aux personnes qu'on suit, ou (projet qu'on dirige) à son équipe. */
export async function creerTache(_: EtatNouvelleTache, form: FormData): Promise<EtatNouvelleTache> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const r = await creerTacheGeree(a, {
    titre: String(form.get("titre") ?? ""),
    description: String(form.get("description") ?? ""),
    projetId: String(form.get("projetId") ?? "") || null,
    assigneId: String(form.get("assigneId") ?? "") || u.id,
    nouvelExterne: nouvelExterne(form),
    echeance: lireDate(form.get("echeance")),
    debut: lireDate(form.get("debut")),
    estimationHeures: lireHeures(form.get("estimationHeures")),
    livrableId: String(form.get("livrableId") ?? "") || null,
    priorite: String(form.get("priorite") ?? "") || null,
  });
  if ("erreur" in r) return { message: r.erreur };
  revalidatePath("/", "layout");
  redirect(retourValide(form.get("retour")) ?? "/semaine");
}

export type EtatSaisieRapide = { message: string | null; ok?: boolean; n?: number; id?: string; annulation?: string; lien?: string };

/**
 * « Ajouter une tâche en une ligne » : la saisie est analysée de nouveau ici (l'aperçu de la page n'est
 * qu'une aide) ; la tâche est pour soi, et seulement sur un projet qu'on voit déjà.
 */
export async function ajouterTacheRapide(etat: EtatSaisieRapide, form: FormData): Promise<EtatSaisieRapide> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const r = analyserSaisie(String(form.get("saisie") ?? ""), aujourdhui(), projets);
  if (!r.titre) return { message: "Écrivez ce qu'il y a à faire.", n: etat.n };
  // Projet choisi dans la liste (« / ») : seulement parmi ceux qu'on voit ; sinon le code reconnu dans le texte.
  const choisi = String(form.get("projetId") ?? "");
  const projet = choisi ? projets.find((p) => p.id === choisi) : r.projet;
  if (choisi && !projet) return { message: "Projet introuvable.", n: etat.n };
  // Personne choisie dans la liste (« @ ») : les règles d'assignation s'appliquent (creerTacheGeree).
  const pour = String(form.get("assigneId") ?? "");
  const assigneId = /^[0-9a-f-]{36}$/.test(pour) ? pour : u.id;
  const depuis = new Date();
  const c = await creerTacheGeree(a, { titre: r.titre, description: "", projetId: projet?.id ?? null, assigneId, echeance: r.echeance, debut: null, estimationHeures: r.heures });
  if ("erreur" in c) return { message: c.erreur, n: etat.n };
  revalidatePath("/", "layout");
  const annulation = await enregistrerAnnulation(u.id, { genre: "tache_creee", tacheId: c.id, depuis: depuis.toISOString() });
  return { message: `Ajoutée : « ${r.titre} »${assigneId !== u.id ? ", la personne est prévenue" : ""}.`, ok: true, n: (etat.n ?? 0) + 1, id: c.id, annulation };
}

/**
 * Mettre à jour une tâche depuis la barre (« # » puis « faite », « bloquée … », une date, une durée, une note,
 * « @ » une personne, « / » un projet). Mêmes règles que la fiche : qui voit la tâche la met à jour ; la
 * confier à quelqu'un d'autre ou la changer de projet suit la règle d'assignation (modifierDefinitionTache).
 */
export async function mettreAJourTacheRapide(etat: EtatSaisieRapide, form: FormData): Promise<EtatSaisieRapide> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const tacheId = String(form.get("tacheId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(tacheId)) return { message: "Tâche introuvable.", n: etat.n };
  const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, tacheId)).limit(1);
  if (!t || !peutModifierTache(a, t)) return { message: "Tâche introuvable.", n: etat.n };
  if (t.annuleeLe) return { message: "Cette tâche est annulée : rétablissez-la d'abord depuis sa fiche.", n: etat.n };
  const r = analyserMiseAJour(String(form.get("saisie") ?? ""), aujourdhui());
  const depuis = new Date();
  // « relancer » : seulement la relance (une alerte à la personne), rien d'autre ne change.
  if (r.relance !== null) {
    if (form.get("assigneId") || form.get("projetId")) return { message: "Relancez d'un côté, confiez de l'autre : une chose à la fois.", n: etat.n };
    if (t.assigneId === u.id) return { message: "C'est votre propre tâche : personne à relancer.", n: etat.n };
    const [cible] = await db.select({ actif: schema.personnes.actif, externe: schema.personnes.externe, acces: schema.personnes.motDePasseHash, prenom: schema.personnes.prenom }).from(schema.personnes).where(eq(schema.personnes.id, t.assigneId));
    if (!cible?.actif) return { message: "Cette personne n'est plus active.", n: etat.n };
    if (cible.externe && !cible.acces) return { message: "Cette personne hors division n'a pas accès à l'application : relancez-la directement.", n: etat.n };
    const [recente] = await db
      .select({ id: schema.evenementsTache.id })
      .from(schema.evenementsTache)
      .where(and(eq(schema.evenementsTache.tacheId, t.id), inArray(schema.evenementsTache.type, ["relance", "relance_annulee"]), sql`${schema.evenementsTache.creeLe} > now() - interval '1 hour'`))
      .limit(1);
    if (recente) return { message: "Déjà relancée il y a moins d'une heure.", n: etat.n };
    const [ev] = await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: u.id, type: "relance", note: r.relance || null }).returning({ id: schema.evenementsTache.id });
    const [no] = await db
      .insert(schema.notifications)
      .values({ personneId: t.assigneId, type: "relance", texte: `${u.prenom} ${u.nom} vous relance sur « ${t.titre} »${r.relance ? ` : ${r.relance}` : ""}`, lien: `/taches/${t.id}` })
      .returning({ id: schema.notifications.id });
    await noter(u.id, "tache_relancee", t.id);
    const annulation = await enregistrerAnnulation(u.id, { genre: "relance", tacheId: t.id, evenementId: ev.id, notificationId: no.id });
    return { message: `« ${t.titre} » : ${cible.prenom} est relancé(e).`, ok: true, n: (etat.n ?? 0) + 1, id: t.id, annulation };
  }
  const pour = String(form.get("assigneId") ?? "");
  const assigneId = /^[0-9a-f-]{36}$/.test(pour) ? pour : t.assigneId;
  const versProjet = String(form.get("projetId") ?? "");
  const projetId = /^[0-9a-f-]{36}$/.test(versProjet) ? versProjet : t.projetId;
  const confier = assigneId !== t.assigneId || projetId !== t.projetId;
  if (!r.statut && !r.echeance && !r.heures && !r.note && !confier) return { message: "Rien à changer : écrivez « faite », « bloquée … », une date, une durée, une note, ou @ une personne.", n: etat.n };
  if (r.statut === "bloquee" && !r.blocage && !t.blocage) return { message: "Dites ce qui bloque : « bloquée attente de la DTI ».", n: etat.n };
  if (r.echeance && t.debut && r.echeance < t.debut) return { message: `L'échéance (${dateCourte(r.echeance)}) précède le début de la tâche (${dateCourte(t.debut)}) : changez le début sur sa fiche.`, n: etat.n };

  // D'abord ce qui peut être refusé (la règle d'assignation), puis le reste.
  if (confier) {
    const d = await modifierDefinitionTache(a, t, { titre: t.titre, description: t.description, projetId, assigneId });
    if ("erreur" in d) return { message: d.erreur, n: etat.n };
  }
  if (r.statut) await changerStatut(t.id, r.statut, u.id, r.blocage);
  if (r.echeance && r.echeance !== t.echeance) {
    await db.update(schema.taches).set({ echeance: r.echeance, majLe: new Date() }).where(eq(schema.taches.id, t.id));
    await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: u.id, type: "echeance", avant: t.echeance, apres: r.echeance });
  }
  if (r.heures && r.heures !== t.estimationHeures) await db.update(schema.taches).set({ estimationHeures: r.heures, majLe: new Date() }).where(eq(schema.taches.id, t.id));
  if (r.note) await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: u.id, type: "note", note: r.note });
  // Bloquée : le chef du projet est prévenu (comme la case cochée par défaut sur la fiche).
  if (r.statut === "bloquee" && t.statut !== "bloquee" && projetId) {
    // Le chef du projet où se trouve la tâche maintenant (elle a pu changer de projet dans la même saisie).
    const [p] = await db.select({ chef: sql<string | null>`coalesce(${schema.projets.referentId}, ${schema.projets.chefProjetId})` }).from(schema.projets).where(eq(schema.projets.id, projetId));
    if (p?.chef && p.chef !== u.id) await db.insert(schema.notifications).values({ personneId: p.chef, type: "blocage", texte: `${u.prenom} ${u.nom} est bloqué(e) sur « ${t.titre} »`, lien: `/taches/${t.id}` });
  }
  await noter(u.id, "tache_modifiee", t.id, { statut: r.statut ?? t.statut, barre: true });
  const [apres] = await db.select({ majLe: schema.taches.majLe }).from(schema.taches).where(eq(schema.taches.id, t.id));
  const annulation = await enregistrerAnnulation(u.id, {
    genre: "tache_maj",
    tacheId: t.id,
    depuis: depuis.toISOString(),
    apresMajLe: apres.majLe.toISOString(),
    avant: { statut: t.statut, blocage: t.blocage, termineeLe: t.termineeLe ? t.termineeLe.toISOString() : null, echeance: t.echeance, estimationHeures: t.estimationHeures, assigneId: t.assigneId, projetId: t.projetId },
  });
  revalidatePath("/", "layout");
  const fait = [r.statut ? LIBELLES_STATUT[r.statut].toLowerCase() : null, confier && assigneId !== t.assigneId ? "confiée, la personne est prévenue" : null, confier && projetId !== t.projetId ? "changée de projet" : null, r.echeance ? "échéance changée" : null, r.heures ? "estimation changée" : null, r.note ? "note ajoutée" : null].filter(Boolean);
  return { message: `« ${t.titre} » : ${fait.join(", ")}.`, ok: true, n: (etat.n ?? 0) + 1, id: t.id, annulation };
}

/** Titre, description, projet et personne d'une tâche. */
export async function definirTache(_: EtatTache, form: FormData): Promise<EtatTache> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, String(form.get("tacheId") ?? ""));
  if (t.annuleeLe) return { message: "Cette tâche est annulée : rétablissez-la d'abord." };
  const r = await modifierDefinitionTache(a, t, {
    titre: String(form.get("titre") ?? ""),
    description: String(form.get("description") ?? ""),
    projetId: String(form.get("projetId") ?? "") || null,
    assigneId: String(form.get("assigneId") ?? "") || t.assigneId,
    nouvelExterne: nouvelExterne(form),
    livrableId: form.has("livrableId") ? String(form.get("livrableId") ?? "") || null : undefined,
    priorite: form.has("priorite") ? String(form.get("priorite") ?? "") : undefined,
  });
  if ("erreur" in r) return { message: r.erreur };
  revalidatePath("/", "layout");
  return { message: null, ok: true };
}

export async function annuler(tacheId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await annulerTache(a, t, String(form.get("motif") ?? ""));
  revalidatePath("/", "layout");
  redirect(`/taches/${tacheId}${"erreur" in r ? `?erreur=${encodeURIComponent(r.erreur)}#suppression` : ""}`);
}

export async function retablir(tacheId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  await retablirTache(a, t);
  revalidatePath("/", "layout");
  redirect(`/taches/${tacheId}`);
}

export async function supprimer(tacheId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  if (form.get("confirme") !== "on") redirect(`/taches/${tacheId}?erreur=${encodeURIComponent("Cochez « Oui, la supprimer » pour confirmer.")}#suppression`);
  const r = await supprimerTache(a, t);
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${tacheId}?erreur=${encodeURIComponent(r.erreur)}#suppression`);
  redirect(retourValide(form.get("retour")) ?? "/semaine");
}

/** Tableau d'un projet : déplacer une carte vers une autre colonne. « Bloquée » passe par la fiche de la tâche (il faut dire ce qui bloque). */
export async function deplacerTache(tacheId: string, statut: string): Promise<{ ok: boolean; message?: string }> {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  if (t.annuleeLe) return { ok: false, message: "Cette tâche est annulée : rétablissez-la d'abord depuis sa fiche." };
  if (statut !== "a_faire" && statut !== "en_cours" && statut !== "faite") return { ok: false, message: "Pour une tâche bloquée, dites ce qui bloque sur sa fiche." };
  await changerStatut(tacheId, statut, u.id);
  await noter(u.id, "tache_deplacee", tacheId, { statut });
  if (t.projetId) revalidatePath(`/projets/${t.projetId}`, "layout");
  return { ok: true };
}

// ---------- Dépendances entre tâches ----------

/** « Attend » : ajouter une tâche précédente (même projet, sans boucle). */
export async function ajouterPrecedente(tacheId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await ajouterDependance(a, t, String(form.get("precedenteId") ?? ""));
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${t.id}?erreur=${encodeURIComponent(r.erreur)}#enchainement`);
  redirect(`/taches/${t.id}#enchainement`);
}

export async function retirerPrecedente(tacheId: string, precedenteId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  await retirerDependance(a, t, precedenteId);
  revalidatePath("/", "layout");
  redirect(`/taches/${t.id}#enchainement`);
}

/** Temps passé sur la tâche (décision du 28 octobre 2026) : une durée et un jour, une note facultative. */
export async function noterTempsPasse(tacheId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await noterTemps(a, t, { jour: lireDate(form.get("jour")), minutes: lireDuree(String(form.get("duree") ?? "")), note: String(form.get("note") ?? "") });
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${t.id}?erreur=${encodeURIComponent(r.erreur)}#temps`);
  redirect(`/taches/${t.id}?temps=note#temps`);
}

export async function retirerTempsPasse(tacheId: string, entreeId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await retirerTemps(a, t, entreeId);
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${t.id}?erreur=${encodeURIComponent(r.erreur)}#temps`);
  redirect(`/taches/${t.id}?temps=retire#temps`);
}

/** Tâche récurrente (lot 4) : faire se répéter la tâche, ou arrêter. */
export async function repeterLaTache(tacheId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await repeterTache(a, t, String(form.get("rythme") ?? ""));
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${t.id}?erreur=${encodeURIComponent(r.erreur)}#repetition`);
  redirect(`/taches/${t.id}?repetition=active#repetition`);
}

export async function arreterLaRepetition(tacheId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, tacheId);
  const r = await arreterRepetition(a, t);
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/taches/${t.id}?erreur=${encodeURIComponent(r.erreur)}#repetition`);
  redirect(`/taches/${t.id}?repetition=arretee#repetition`);
}
