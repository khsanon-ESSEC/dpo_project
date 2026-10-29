/**
 * Clôture et budget d'un projet (lot 4, décision du 28 octobre 2026). Règles : src/lib/suivi.ts.
 * Clôturer, rouvrir, tenir le budget : ceux qui gèrent le projet (chef, référent DPO, sa direction, les exécutifs).
 * Les actions vérifient que la personne voit le projet ; ces fonctions vérifient le reste.
 */
import "server-only";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { peutGererProjet } from "@/lib/projets";
import { dateClotureValide, devise, objectifs, peutEtreCloture } from "@/lib/suivi";
import { acteur } from "./gestion";
import { recalculerSante } from "./sante";

const texte = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

type Projet = typeof schema.projets.$inferSelect;
async function projetGere(a: Acces, projetId: string): Promise<{ p: Projet } | { erreur: string }> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return { erreur: "Projet introuvable." };
  if (!peutGererProjet(acteur(a), p)) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs clôturent un projet et tiennent son budget." };
  return { p };
}

/** Ce qui reste ouvert sur le projet : signalé au moment de clôturer. */
export async function etatAvantCloture(projetId: string) {
  const [[t], [l], [r], [ph]] = await Promise.all([
    db.select({ n: count() }).from(schema.taches).where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe), ne(schema.taches.statut, "faite"))),
    db.select({ n: count() }).from(schema.indicateurs).where(and(eq(schema.indicateurs.projetId, projetId), ne(schema.indicateurs.etat, "atteint"))),
    db.select({ n: count() }).from(schema.risquesProjet).where(and(eq(schema.risquesProjet.projetId, projetId), eq(schema.risquesProjet.statut, "ouvert"))),
    db.select({ n: count() }).from(schema.phasesProjet).where(and(eq(schema.phasesProjet.projetId, projetId), isNull(schema.phasesProjet.termineeLe))),
  ]);
  return { tachesOuvertes: Number(t.n), livrablesNonValides: Number(l.n), risquesOuverts: Number(r.n), phasesOuvertes: Number(ph.n) };
}

export type DonneesCloture = { clotureLe: string | null; bilan: string; objectifs: string; lecons: string };

export async function cloturerProjet(a: Acces, projetId: string, d: DonneesCloture): Promise<{ ok: true } | { erreur: string }> {
  const r = await projetGere(a, projetId);
  if ("erreur" in r) return r;
  const { p } = r;
  if (!peutEtreCloture(p)) return { erreur: "Ce projet ne peut pas être clôturé (demande, refusé, déjà finalisé ou archivé)." };
  const jour = aujourdhui();
  const le = dateClotureValide(d.clotureLe || jour, jour, p.dateEntree);
  if (!le) return { erreur: "La date de clôture : au plus tard aujourd'hui, pas avant l'entrée du projet." };
  const bilan = texte(d.bilan, 4000);
  if (bilan.length < 10) return { erreur: "Écrivez le bilan du projet en quelques phrases : ce qui a été livré, ce qui ne l'a pas été." };
  const obj = objectifs(d.objectifs);
  if (!obj) return { erreur: "Dites si les objectifs du projet sont atteints." };
  await db
    .update(schema.projets)
    .set({ statut: "finalise", clotureLe: le, clotureParId: a.moi.id, bilanCloture: bilan, objectifsAtteints: obj, leconsApprises: texte(d.lecons, 4000), majLe: new Date() })
    .where(eq(schema.projets.id, projetId));
  await noter(a.moi.id, "projet_cloture", projetId, { le, objectifs: obj });
  // L'équipe et le sponsor sont prévenus (sauf qui clôture, et les personnes hors division sans accès).
  const membres = await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projetId));
  const ids = [...new Set([p.chefProjetId, p.referentId, p.sponsorId, ...membres.map((m) => m.id)].filter((x): x is string => !!x && x !== a.moi.id))];
  if (ids.length) {
    const gens = await db.select({ id: schema.personnes.id, externe: schema.personnes.externe, acces: sql<boolean>`${schema.personnes.motDePasseHash} is not null`, actif: schema.personnes.actif }).from(schema.personnes).where(inArray(schema.personnes.id, ids));
    const qui = gens.filter((g) => g.actif && (!g.externe || g.acces)).map((g) => g.id);
    if (qui.length) await db.insert(schema.notifications).values(qui.map((personneId) => ({ personneId, type: "projet", texte: `Le projet « ${p.titre} » est clôturé : son bilan est sur sa fiche`, lien: `/projets/${projetId}#cloture` })));
  }
  await recalculerSante([projetId]);
  return { ok: true };
}

/** Rouvrir un projet clôturé : il repart « en cours » ; le bilan est gardé (il resservira à la prochaine clôture). */
export async function rouvrirProjet(a: Acces, projetId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await projetGere(a, projetId);
  if ("erreur" in r) return r;
  if (r.p.statut !== "finalise" || r.p.archiveLe) return { erreur: "Seul un projet finalisé, pas archivé, se rouvre." };
  await db.update(schema.projets).set({ statut: "en_cours", clotureLe: null, clotureParId: null, majLe: new Date() }).where(eq(schema.projets.id, projetId));
  await noter(a.moi.id, "projet_rouvert", projetId);
  await recalculerSante([projetId]);
  return { ok: true };
}

export type DonneesBudget = { prevu: number | null; engage: number | null; devise: string; note: string };

export async function enregistrerBudget(a: Acces, projetId: string, d: DonneesBudget): Promise<{ ok: true } | { erreur: string }> {
  const r = await projetGere(a, projetId);
  if ("erreur" in r) return r;
  if (r.p.statut === "requete" || r.p.statut === "refuse") return { erreur: "Le budget se suit une fois le projet accepté." };
  await db
    .update(schema.projets)
    .set({ budgetPrevu: d.prevu, budgetEngage: d.engage, budgetDevise: devise(d.devise), budgetNote: texte(d.note, 500), budgetMajLe: aujourdhui(), majLe: new Date() })
    .where(eq(schema.projets.id, projetId));
  await noter(a.moi.id, "budget_modifie", projetId, { prevu: d.prevu, engage: d.engage, devise: devise(d.devise) });
  return { ok: true };
}
