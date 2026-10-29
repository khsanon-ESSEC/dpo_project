/**
 * Registre des risques et phases d'un projet (décision du 28 octobre 2026). Règles : src/lib/risques.ts.
 * Risques : l'équipe du projet et ceux qui le gèrent les notent et les suivent ; seuls l'auteur et ceux qui
 * gèrent le projet les retirent. Phases : ceux qui gèrent le projet. Les actions vérifient que la personne
 * voit le projet ; ces fonctions vérifient le reste.
 */
import "server-only";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation, personneActuelle } from "@/lib/organisation";
import { peutGererProjet, peutModifierDecision, peutNoterDecision } from "@/lib/projets";
import { niveau, PHASES_TYPES, statutRisque, trierRisques, type StatutRisque } from "@/lib/risques";
import { nomComplet } from "@/lib/regles";
import { acteur, projetPourAssignation } from "./gestion";
import { recalculerSante } from "./sante";

const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

async function droits(a: Acces, projetId: string) {
  const projet = await projetPourAssignation(projetId);
  if (!projet) return null;
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  const gere = peutGererProjet(acteur(a), p);
  const ouvert = !p.archiveLe && p.statut !== "requete" && p.statut !== "refuse";
  return { projet: p, gere, equipe: peutNoterDecision(a.moi.id, gere, projet), ouvert };
}

// ---------------------------------------------------------------------------
// Risques
// ---------------------------------------------------------------------------

export async function risquesDuProjet(projetId: string) {
  const [lignes, org] = await Promise.all([db.select().from(schema.risquesProjet).where(eq(schema.risquesProjet.projetId, projetId)), chargerOrganisation()]);
  const nom = (id: string | null) => (id && org.personnes.get(id) ? nomComplet(org.personnes.get(id)!) : null);
  return trierRisques(lignes).map((r) => ({ ...r, responsable: nom(r.responsableId), auteur: nom(r.auteurId) }));
}

export type DonneesRisque = { titre: string; description: string; probabilite: unknown; impact: unknown; responsableId: string | null; reponse: string; revueLe: string | null };

/** Créer (risqueId vide) ou modifier un risque. */
export async function enregistrerRisque(a: Acces, projetId: string, risqueId: string | null, d: DonneesRisque): Promise<{ ok: true; id: string } | { erreur: string }> {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (!r.ouvert) return { erreur: "Ce projet n'est pas en cours." };
  if (!r.equipe) return { erreur: "Seuls l'équipe du projet et ceux qui le gèrent tiennent son registre des risques." };
  const titre = texte(d.titre, 200);
  if (titre.length < 3) return { erreur: "Décrivez le risque en quelques mots." };
  let responsableId: string | null = null;
  if (d.responsableId) {
    const p = await personneActuelle(d.responsableId);
    if (!p?.actif) return { erreur: "Ce responsable n'est plus actif." };
    responsableId = p.id;
  }
  const valeurs = {
    titre: titre.charAt(0).toUpperCase() + titre.slice(1),
    description: texte(d.description, 1000),
    probabilite: niveau(d.probabilite),
    impact: niveau(d.impact),
    responsableId,
    reponse: texte(d.reponse, 1000),
    revueLe: date(d.revueLe),
  };
  let id = risqueId;
  let ancienResponsable: string | null = null;
  if (risqueId) {
    const [x] = await db.select().from(schema.risquesProjet).where(and(eq(schema.risquesProjet.id, risqueId), eq(schema.risquesProjet.projetId, projetId)));
    if (!x) return { erreur: "Risque introuvable." };
    ancienResponsable = x.responsableId;
    await db.update(schema.risquesProjet).set({ ...valeurs, majLe: new Date() }).where(eq(schema.risquesProjet.id, risqueId));
    await noter(a.moi.id, "risque_modifie", risqueId, { projet: projetId });
  } else {
    const [n] = await db.insert(schema.risquesProjet).values({ projetId, ...valeurs, auteurId: a.moi.id }).returning({ id: schema.risquesProjet.id });
    id = n.id;
    await noter(a.moi.id, "risque_note", projetId, { risque: n.id });
  }
  if (responsableId && responsableId !== a.moi.id && responsableId !== ancienResponsable) {
    await db.insert(schema.notifications).values({ personneId: responsableId, type: "projet", texte: `Vous suivez le risque « ${valeurs.titre} » (${r.projet.code})`, lien: `/projets/${projetId}#risques` });
  }
  await recalculerSante([projetId]);
  return { ok: true, id: id! };
}

export async function changerStatutRisque(a: Acces, projetId: string, risqueId: string, statut: StatutRisque | string): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  const [x] = await db.select().from(schema.risquesProjet).where(and(eq(schema.risquesProjet.id, risqueId), eq(schema.risquesProjet.projetId, projetId)));
  if (!r || !x) return { erreur: "Risque introuvable." };
  if (!r.equipe) return { erreur: "Seuls l'équipe du projet et ceux qui le gèrent tiennent son registre des risques." };
  await db.update(schema.risquesProjet).set({ statut: statutRisque(statut), majLe: new Date() }).where(eq(schema.risquesProjet.id, risqueId));
  await noter(a.moi.id, "risque_statut", risqueId, { statut: statutRisque(statut) });
  await recalculerSante([projetId]);
  return { ok: true };
}

export async function retirerRisque(a: Acces, projetId: string, risqueId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  const [x] = await db.select().from(schema.risquesProjet).where(and(eq(schema.risquesProjet.id, risqueId), eq(schema.risquesProjet.projetId, projetId)));
  if (!r || !x) return { erreur: "Risque introuvable." };
  if (!peutModifierDecision(a.moi.id, r.gere, x.auteurId)) return { erreur: "Seuls son auteur et ceux qui gèrent le projet retirent un risque ; vous pouvez le passer à « Clos »." };
  await db.delete(schema.risquesProjet).where(eq(schema.risquesProjet.id, risqueId));
  await noter(a.moi.id, "risque_retire", projetId, { titre: x.titre });
  await recalculerSante([projetId]);
  return { ok: true };
}

/** Pour la santé calculée : le nombre de risques critiques ouverts de chaque projet. */
export async function risquesCritiquesOuverts(projetIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!projetIds.length) return m;
  const l = await db
    .select({ projetId: schema.risquesProjet.projetId, probabilite: schema.risquesProjet.probabilite, impact: schema.risquesProjet.impact })
    .from(schema.risquesProjet)
    .where(and(inArray(schema.risquesProjet.projetId, projetIds), eq(schema.risquesProjet.statut, "ouvert")));
  for (const r of l) if (r.probabilite * r.impact >= 6) m.set(r.projetId, (m.get(r.projetId) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function phasesDuProjet(projetId: string) {
  return db.select().from(schema.phasesProjet).where(eq(schema.phasesProjet.projetId, projetId)).orderBy(asc(schema.phasesProjet.ordre));
}

export type DonneesPhase = { nom: string; debut: string | null; fin: string | null };

function validerPhase(d: DonneesPhase): { valeurs: { nom: string; debut: string | null; fin: string | null } } | { erreur: string } {
  const nom = texte(d.nom, 80);
  if (nom.length < 2) return { erreur: "Donnez un nom à la phase." };
  const debut = date(d.debut);
  const fin = date(d.fin);
  if (debut && fin && debut > fin) return { erreur: "La fin d'une phase suit son début." };
  return { valeurs: { nom: nom.charAt(0).toUpperCase() + nom.slice(1), debut, fin } };
}

async function exigerGestion(a: Acces, projetId: string) {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." } as const;
  if (!r.gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs organisent les phases." } as const;
  return r;
}

export async function ajouterPhase(a: Acces, projetId: string, d: DonneesPhase): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  const v = validerPhase(d);
  if ("erreur" in v) return v;
  const [{ m }] = await db.select({ m: max(schema.phasesProjet.ordre) }).from(schema.phasesProjet).where(eq(schema.phasesProjet.projetId, projetId));
  await db.insert(schema.phasesProjet).values({ projetId, ordre: (m ?? 0) + 1, ...v.valeurs });
  await noter(a.moi.id, "phase_ajoutee", projetId, { nom: v.valeurs.nom });
  await recalculerSante([projetId]);
  return { ok: true };
}

/** Démarrer avec les phases types, réparties sur la durée du projet (de l'entrée à la fin prévue), quand il n'en a pas. */
export async function utiliserPhasesTypes(a: Acces, projetId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  if ((await phasesDuProjet(projetId)).length) return { erreur: "Ce projet a déjà ses phases." };
  const debut = r.projet.dateEntree;
  const fin = r.projet.dateFinPrevue;
  const jours = debut && fin && fin > debut ? (new Date(`${fin}T12:00:00Z`).getTime() - new Date(`${debut}T12:00:00Z`).getTime()) / 86400000 : 0;
  const jour = (k: number) => new Date(new Date(`${debut}T12:00:00Z`).getTime() + Math.round((jours * k) / PHASES_TYPES.length) * 86400000).toISOString().slice(0, 10);
  await db.insert(schema.phasesProjet).values(
    PHASES_TYPES.map((nom, i) => ({ projetId, ordre: i + 1, nom, debut: jours ? jour(i) : null, fin: jours ? (i === PHASES_TYPES.length - 1 ? fin : jour(i + 1)) : null })),
  );
  await noter(a.moi.id, "phases_types", projetId);
  await recalculerSante([projetId]);
  return { ok: true };
}

export async function modifierPhase(a: Acces, projetId: string, phaseId: string, d: DonneesPhase): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  const v = validerPhase(d);
  if ("erreur" in v) return v;
  await db.update(schema.phasesProjet).set(v.valeurs).where(and(eq(schema.phasesProjet.id, phaseId), eq(schema.phasesProjet.projetId, projetId)));
  await recalculerSante([projetId]);
  return { ok: true };
}

/** Terminer une phase (ou la rouvrir). */
export async function terminerPhase(a: Acces, projetId: string, phaseId: string, terminee: boolean): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  await db
    .update(schema.phasesProjet)
    .set({ termineeLe: terminee ? aujourdhui() : null })
    .where(and(eq(schema.phasesProjet.id, phaseId), eq(schema.phasesProjet.projetId, projetId)));
  await noter(a.moi.id, terminee ? "phase_terminee" : "phase_rouverte", phaseId, { projet: projetId });
  await recalculerSante([projetId]);
  return { ok: true };
}

export async function retirerPhase(a: Acces, projetId: string, phaseId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  await db.delete(schema.phasesProjet).where(and(eq(schema.phasesProjet.id, phaseId), eq(schema.phasesProjet.projetId, projetId)));
  const reste = await phasesDuProjet(projetId);
  for (const [i, x] of reste.entries()) await db.update(schema.phasesProjet).set({ ordre: i + 1 }).where(eq(schema.phasesProjet.id, x.id));
  await recalculerSante([projetId]);
  return { ok: true };
}

export async function deplacerPhase(a: Acces, projetId: string, phaseId: string, sens: -1 | 1): Promise<{ ok: true } | { erreur: string }> {
  const r = await exigerGestion(a, projetId);
  if ("erreur" in r) return r;
  const liste = await phasesDuProjet(projetId);
  const i = liste.findIndex((x) => x.id === phaseId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return { ok: true };
  [liste[i], liste[j]] = [liste[j], liste[i]];
  for (const [k, x] of liste.entries()) await db.update(schema.phasesProjet).set({ ordre: k + 1 }).where(eq(schema.phasesProjet.id, x.id));
  return { ok: true };
}

/** Pour la santé calculée et le portefeuille : les phases de chaque projet. */
export async function phasesDe(projetIds: string[]) {
  const m = new Map<string, (typeof schema.phasesProjet.$inferSelect)[]>();
  if (!projetIds.length) return m;
  const l = await db.select().from(schema.phasesProjet).where(inArray(schema.phasesProjet.projetId, projetIds)).orderBy(asc(schema.phasesProjet.ordre));
  for (const p of l) m.set(p.projetId, [...(m.get(p.projetId) ?? []), p]);
  return m;
}
