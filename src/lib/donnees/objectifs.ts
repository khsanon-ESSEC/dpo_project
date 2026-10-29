/**
 * Objectifs et bénéfices attendus d'un projet (demandé le 29 octobre 2026). Règles : src/lib/objectifs.ts.
 * Ceux qui gèrent le projet (chef, référent DPO, sa direction, les exécutifs) les écrivent tant que le projet est
 * ouvert ; la valeur constatée d'un bénéfice se note aussi après la clôture (les bénéfices se voient après le
 * lancement). Tout le monde qui voit le projet les lit. Les actions vérifient que la personne voit le projet.
 */
import "server-only";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { peutGererProjet } from "@/lib/projets";
import { LONGUEUR, MAX_PAR_GENRE, estGenreObjectif, evaluation, objectifsDuTexte, peutNoterConstat, validerObjectif, type GenreObjectif, type SaisieObjectif } from "@/lib/objectifs";
import type { Objectifs } from "@/lib/suivi";
import { acteur } from "./gestion";

export type ObjectifProjet = typeof schema.objectifsProjet.$inferSelect;

const FIGE = "Ce projet n'est pas en cours (archivé, refusé ou finalisé) : ses objectifs sont figés.";

async function droits(a: Acces, projetId: string) {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return null;
  const gere = peutGererProjet(acteur(a), p);
  // Une demande (requete) s'écrit encore : ses objectifs se précisent avant la décision.
  const ouvert = !p.archiveLe && p.statut !== "refuse" && p.statut !== "finalise";
  return { p, gere, ouvert };
}

export async function objectifsDuProjet(projetId: string): Promise<{ objectifs: ObjectifProjet[]; benefices: ObjectifProjet[] }> {
  const l = await db.select().from(schema.objectifsProjet).where(eq(schema.objectifsProjet.projetId, projetId)).orderBy(asc(schema.objectifsProjet.ordre), asc(schema.objectifsProjet.creeLe));
  return { objectifs: l.filter((x) => x.genre === "objectif"), benefices: l.filter((x) => x.genre === "benefice") };
}

/** Les objectifs de plusieurs projets (rapport au conseil). */
export async function objectifsDesProjets(projetIds: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  if (!projetIds.length) return m;
  const l = await db
    .select({ projetId: schema.objectifsProjet.projetId, libelle: schema.objectifsProjet.libelle })
    .from(schema.objectifsProjet)
    .where(and(inArray(schema.objectifsProjet.projetId, projetIds), eq(schema.objectifsProjet.genre, "objectif")))
    .orderBy(asc(schema.objectifsProjet.ordre), asc(schema.objectifsProjet.creeLe));
  for (const x of l) m.set(x.projetId, [...(m.get(x.projetId) ?? []), x.libelle]);
  return m;
}

export async function ajouterObjectif(a: Acces, projetId: string, genre: unknown, d: SaisieObjectif): Promise<{ ok: true; id: string } | { erreur: string }> {
  if (!estGenreObjectif(genre)) return { erreur: "Objectif ou bénéfice ?" };
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (!r.gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs écrivent les objectifs du projet." };
  if (!r.ouvert) return { erreur: FIGE };
  const v = validerObjectif(genre, d);
  if ("erreur" in v) return v;
  const deja = await db.select({ id: schema.objectifsProjet.id }).from(schema.objectifsProjet).where(and(eq(schema.objectifsProjet.projetId, projetId), eq(schema.objectifsProjet.genre, genre)));
  if (deja.length >= MAX_PAR_GENRE) return { erreur: `${MAX_PAR_GENRE} ${genre === "objectif" ? "objectifs" : "bénéfices"} au plus : regroupez-en.` };
  const [{ m }] = await db.select({ m: max(schema.objectifsProjet.ordre) }).from(schema.objectifsProjet).where(and(eq(schema.objectifsProjet.projetId, projetId), eq(schema.objectifsProjet.genre, genre)));
  const [n] = await db
    .insert(schema.objectifsProjet)
    .values({ projetId, genre, ordre: (m ?? 0) + 1, ...v.valeurs })
    .returning({ id: schema.objectifsProjet.id });
  await noter(a.moi.id, genre === "objectif" ? "objectif_ajoute" : "benefice_ajoute", projetId, { id: n.id, libelle: v.valeurs.libelle });
  return { ok: true, id: n.id };
}

async function ligne(projetId: string, id: string) {
  const [x] = await db.select().from(schema.objectifsProjet).where(and(eq(schema.objectifsProjet.id, id), eq(schema.objectifsProjet.projetId, projetId)));
  return x ?? null;
}

export async function modifierObjectif(a: Acces, projetId: string, id: string, d: SaisieObjectif): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (!r.gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs écrivent les objectifs du projet." };
  if (!r.ouvert) return { erreur: FIGE };
  const x = await ligne(projetId, id);
  if (!x || !estGenreObjectif(x.genre)) return { erreur: "Introuvable." };
  const v = validerObjectif(x.genre as GenreObjectif, d);
  if ("erreur" in v) return v;
  await db.update(schema.objectifsProjet).set({ ...v.valeurs, majLe: new Date() }).where(eq(schema.objectifsProjet.id, id));
  await noter(a.moi.id, x.genre === "objectif" ? "objectif_modifie" : "benefice_modifie", projetId, { id, avant: x.libelle, libelle: v.valeurs.libelle });
  return { ok: true };
}

export async function retirerObjectif(a: Acces, projetId: string, id: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (!r.gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs écrivent les objectifs du projet." };
  if (!r.ouvert) return { erreur: FIGE };
  const x = await ligne(projetId, id);
  if (!x) return { ok: true };
  await db.delete(schema.objectifsProjet).where(eq(schema.objectifsProjet.id, id));
  await noter(a.moi.id, x.genre === "objectif" ? "objectif_retire" : "benefice_retire", projetId, { id, libelle: x.libelle, indicateur: x.indicateur, depart: x.depart, cible: x.cible });
  return { ok: true };
}

/** La valeur constatée d'un bénéfice (vide : effacée). Possible après la clôture, pas sur un projet archivé. */
export async function noterConstat(a: Acces, projetId: string, id: string, valeur: unknown): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (!r.gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs notent les bénéfices constatés." };
  if (!peutNoterConstat(r.p)) return { erreur: "Ce projet n'est pas en cours ni finalisé : ses bénéfices ne se mettent plus à jour." };
  const x = await ligne(projetId, id);
  if (!x || x.genre !== "benefice") return { erreur: "Bénéfice introuvable." };
  const v = String(valeur ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, LONGUEUR.valeur);
  const jour = aujourdhui();
  // L'historique (29 octobre 2026) : une mesure par jour ; une correction le même jour la remplace ; une valeur vide
  // retire la mesure du jour. La dernière mesure reste recopiée sur le bénéfice.
  if (v) {
    await db
      .insert(schema.constatsBenefice)
      .values({ objectifId: id, valeur: v, le: jour, parId: a.moi.id })
      .onConflictDoUpdate({ target: [schema.constatsBenefice.objectifId, schema.constatsBenefice.le], set: { valeur: v, parId: a.moi.id, creeLe: new Date() } });
  } else {
    await db.delete(schema.constatsBenefice).where(and(eq(schema.constatsBenefice.objectifId, id), eq(schema.constatsBenefice.le, jour)));
  }
  const [dernier] = await db.select().from(schema.constatsBenefice).where(eq(schema.constatsBenefice.objectifId, id)).orderBy(desc(schema.constatsBenefice.le)).limit(1);
  await db.update(schema.objectifsProjet).set({ constate: dernier?.valeur ?? "", constateLe: dernier?.le ?? null, majLe: new Date() }).where(eq(schema.objectifsProjet.id, id));
  await noter(a.moi.id, "benefice_constate", projetId, { id, avant: x.constate, constate: v });
  return { ok: true };
}

/** L'historique des valeurs constatées de ces bénéfices, du plus ancien au plus récent (src/lib/progression.ts). */
export async function constatsDesBenefices(ids: string[]): Promise<Map<string, { valeur: string; le: string }[]>> {
  const m = new Map<string, { valeur: string; le: string }[]>();
  if (!ids.length) return m;
  const l = await db.select().from(schema.constatsBenefice).where(inArray(schema.constatsBenefice.objectifId, ids)).orderBy(asc(schema.constatsBenefice.le));
  for (const x of l) m.set(x.objectifId, [...(m.get(x.objectifId) ?? []), { valeur: x.valeur, le: x.le }]);
  return m;
}

/** Les objectifs d'une demande de projet (un par ligne), écrits à sa création par qui la propose. */
export async function objectifsDeLaDemande(projetId: string, texte: unknown) {
  const libelles = objectifsDuTexte(texte);
  if (!libelles.length) return 0;
  await db.insert(schema.objectifsProjet).values(libelles.map((libelle, i) => ({ projetId, genre: "objectif", ordre: i + 1, libelle })));
  return libelles.length;
}

/**
 * À la clôture : l'évaluation de chaque objectif (identifiant → oui, en partie, non). Renvoie le bilan d'ensemble
 * calculé, ou une erreur si un objectif n'est pas évalué. Sans objectif écrit : null (le bilan global se choisit).
 */
export async function lireEvaluations(projetId: string, valeurs: Record<string, unknown>): Promise<{ evaluations: Map<string, Objectifs> } | { erreur: string } | null> {
  const { objectifs } = await objectifsDuProjet(projetId);
  if (!objectifs.length) return null;
  const m = new Map<string, Objectifs>();
  for (const o of objectifs) {
    const e = evaluation(valeurs[o.id]);
    if (!e) return { erreur: `Dites si l'objectif « ${o.libelle.slice(0, 60)} » est atteint.` };
    m.set(o.id, e);
  }
  return { evaluations: m };
}

export async function enregistrerEvaluations(evaluations: Map<string, Objectifs>) {
  for (const [id, e] of evaluations) await db.update(schema.objectifsProjet).set({ evaluation: e, majLe: new Date() }).where(eq(schema.objectifsProjet.id, id));
}
