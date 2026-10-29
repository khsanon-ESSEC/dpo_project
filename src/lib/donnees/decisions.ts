/**
 * Registre des décisions d'un projet (décision du 28 octobre 2026) : ce qui a été décidé, quand, par quelle instance,
 * et pourquoi. Règles : src/lib/projets.ts (peutNoterDecision, peutModifierDecision). Les actions vérifient que la
 * personne voit le projet ; ces fonctions vérifient le reste.
 */
import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { peutGererProjet, peutModifierDecision, peutNoterDecision } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { acteur, projetPourAssignation } from "./gestion";

/** Les instances proposées pendant la saisie : celles déjà notées, puis quelques-unes courantes. */
const INSTANCES = ["Comité de pilotage", "Direction de la division", "Chef de projet", "Comité exécutif", "Conseil d'administration"];

export type DonneesDecision = { texte: string; decideeLe: string; instance: string; contexte: string };

const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

export async function decisionsDuProjet(projetId: string) {
  const [lignes, org] = await Promise.all([
    db.select().from(schema.decisionsProjet).where(eq(schema.decisionsProjet.projetId, projetId)).orderBy(desc(schema.decisionsProjet.decideeLe), desc(schema.decisionsProjet.creeLe)),
    chargerOrganisation(),
  ]);
  return lignes.map((d) => {
    const a = d.auteurId ? org.personnes.get(d.auteurId) : undefined;
    return { ...d, auteur: a ? nomComplet(a) : null };
  });
}

export async function instancesConnues(): Promise<string[]> {
  const l = await db.selectDistinct({ instance: schema.decisionsProjet.instance }).from(schema.decisionsProjet).where(ne(schema.decisionsProjet.instance, ""));
  return [...new Set([...l.map((x) => x.instance), ...INSTANCES])];
}

/** Un projet archivé, refusé ou encore en demande : son registre est figé (revue du 29 octobre 2026). */
const fige = (p: { archiveLe: Date | null; statut: string }) => !!p.archiveLe || p.statut === "requete" || p.statut === "refuse";
const FIGE = "Ce projet n'est pas en cours (archivé, refusé ou en demande) : son registre est figé.";

/** Le projet, et ce que la personne peut y faire (noter, gérer). */
async function droits(a: Acces, projetId: string) {
  const projet = await projetPourAssignation(projetId);
  if (!projet) return null;
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  const gere = peutGererProjet(acteur(a), p);
  return { projet: p, gere, noter: peutNoterDecision(a.moi.id, gere, projet) };
}

function valider(d: DonneesDecision): { valeurs: { texte: string; decideeLe: string; instance: string; contexte: string } } | { erreur: string } {
  const t = texte(d.texte, 1000);
  if (t.length < 3) return { erreur: "Écrivez la décision." };
  const le = date(d.decideeLe) ?? aujourdhui();
  if (le > aujourdhui()) return { erreur: "Une décision se note une fois prise : sa date ne peut pas être dans le futur." };
  return { valeurs: { texte: t.charAt(0).toUpperCase() + t.slice(1), decideeLe: le, instance: texte(d.instance, 120), contexte: texte(d.contexte, 1000) } };
}

export async function noterDecision(a: Acces, projetId: string, d: DonneesDecision): Promise<{ ok: true; id: string } | { erreur: string }> {
  const r = await droits(a, projetId);
  if (!r) return { erreur: "Projet introuvable." };
  if (r.projet.archiveLe || r.projet.statut === "requete" || r.projet.statut === "refuse") return { erreur: "Ce projet ne reçoit plus de décisions (demande, refusé ou archivé)." };
  if (!r.noter) return { erreur: "Seuls l'équipe du projet et ceux qui le gèrent notent ses décisions." };
  const v = valider(d);
  if ("erreur" in v) return v;
  const [n] = await db.insert(schema.decisionsProjet).values({ projetId, ...v.valeurs, auteurId: a.moi.id }).returning({ id: schema.decisionsProjet.id });
  await noter(a.moi.id, "decision_notee", projetId, { decision: n.id });
  return { ok: true, id: n.id };
}

export async function modifierDecision(a: Acces, projetId: string, decisionId: string, d: DonneesDecision): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  const [x] = await db.select().from(schema.decisionsProjet).where(and(eq(schema.decisionsProjet.id, decisionId), eq(schema.decisionsProjet.projetId, projetId)));
  if (!r || !x) return { erreur: "Décision introuvable." };
  if (!peutModifierDecision(a.moi.id, r.gere, x.auteurId)) return { erreur: "Seuls son auteur et ceux qui gèrent le projet corrigent une décision." };
  if (fige(r.projet)) return { erreur: FIGE };
  const v = valider(d);
  if ("erreur" in v) return v;
  await db.update(schema.decisionsProjet).set({ ...v.valeurs, majLe: new Date() }).where(eq(schema.decisionsProjet.id, decisionId));
  await noter(a.moi.id, "decision_modifiee", decisionId, { projet: projetId });
  return { ok: true };
}

export async function retirerDecision(a: Acces, projetId: string, decisionId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  const [x] = await db.select().from(schema.decisionsProjet).where(and(eq(schema.decisionsProjet.id, decisionId), eq(schema.decisionsProjet.projetId, projetId)));
  if (!r || !x) return { erreur: "Décision introuvable." };
  if (!peutModifierDecision(a.moi.id, r.gere, x.auteurId)) return { erreur: "Seuls son auteur et ceux qui gèrent le projet retirent une décision." };
  if (fige(r.projet)) return { erreur: FIGE };
  await db.delete(schema.decisionsProjet).where(eq(schema.decisionsProjet.id, decisionId));
  await noter(a.moi.id, "decision_retiree", projetId, { texte: x.texte.slice(0, 200) });
  return { ok: true };
}

/** Pour le rapport au conseil (assistant) : les décisions notées depuis une date. */
export async function decisionsDepuis(projetId: string, depuis: string) {
  return (await decisionsDuProjet(projetId)).filter((d) => d.decideeLe >= depuis);
}
