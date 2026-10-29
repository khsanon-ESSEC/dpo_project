/**
 * RACI type de la DPO et RACI propre à un projet (demandé le 29 octobre 2026). Règles : src/lib/raci.ts.
 * Le type se change dans Organisation (administrateurs et exécutifs, comme les listes) ; un projet s'en écarte
 * quand ceux qui le gèrent l'adaptent, et y revient d'un clic. Tout le monde qui voit le projet le lit.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { noter } from "@/lib/journal";
import { peutGererProjet } from "@/lib/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { nomsDuRole, RACI_DPO, validerRaci, type Raci } from "@/lib/raci";
import { acteur } from "./gestion";
import { peutGererListes } from "./listes";

const enRaci = (x: { colonnes: unknown; lignes: unknown }): Raci => {
  const v = validerRaci({ colonnes: x.colonnes, lignes: x.lignes });
  return "raci" in v ? v.raci : RACI_DPO;
};

export async function raciType(): Promise<Raci> {
  const [t] = await db.select().from(schema.raci).where(eq(schema.raci.cle, "type"));
  return t ? enRaci(t) : RACI_DPO;
}

/** Le RACI d'un projet : le sien s'il s'écarte du type, sinon le type. */
export async function raciDuProjet(projetId: string): Promise<{ raci: Raci; propre: boolean; majLe: Date | null; majParId: string | null }> {
  const [r] = await db.select().from(schema.raci).where(eq(schema.raci.cle, projetId));
  if (r) return { raci: enRaci(r), propre: true, majLe: r.majLe, majParId: r.majParId };
  return { raci: await raciType(), propre: false, majLe: null, majParId: null };
}

export const peutGererRaciType = (a: Acces) => peutGererListes(a.moi, a);

export async function enregistrerRaciType(a: Acces, brut: unknown): Promise<{ ok: true; avertissements: string[] } | { erreur: string }> {
  if (!peutGererRaciType(a)) return { erreur: "Le RACI type se change par les administrateurs et les exécutifs." };
  const v = validerRaci(brut);
  if ("erreur" in v) return v;
  await db
    .insert(schema.raci)
    .values({ cle: "type", colonnes: v.raci.colonnes, lignes: v.raci.lignes, majParId: a.moi.id, majLe: new Date() })
    .onConflictDoUpdate({ target: schema.raci.cle, set: { colonnes: v.raci.colonnes, lignes: v.raci.lignes, majParId: a.moi.id, majLe: new Date() } });
  await noter(a.moi.id, "raci_type_modifie", null, { activites: v.raci.lignes.length, roles: v.raci.colonnes.map((c) => c.libelle) });
  return { ok: true, avertissements: v.avertissements };
}

async function projetGere(a: Acces, projetId: string): Promise<{ erreur: string } | null> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return { erreur: "Projet introuvable." };
  if (!peutGererProjet(acteur(a), p)) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs adaptent le RACI du projet." };
  if (p.archiveLe || p.statut === "refuse" || p.statut === "finalise") return { erreur: "Ce projet n'est pas en cours : son RACI est figé." };
  return null;
}

/** Adapter le RACI d'un projet (brut absent : partir du type). */
export async function enregistrerRaciProjet(a: Acces, projetId: string, brut?: unknown): Promise<{ ok: true; avertissements: string[] } | { erreur: string }> {
  const refus = await projetGere(a, projetId);
  if (refus) return refus;
  const v = validerRaci(brut === undefined ? await raciType() : brut);
  if ("erreur" in v) return v;
  await db
    .insert(schema.raci)
    .values({ cle: projetId, projetId, colonnes: v.raci.colonnes, lignes: v.raci.lignes, majParId: a.moi.id, majLe: new Date() })
    .onConflictDoUpdate({ target: schema.raci.cle, set: { colonnes: v.raci.colonnes, lignes: v.raci.lignes, majParId: a.moi.id, majLe: new Date() } });
  await noter(a.moi.id, "raci_projet_modifie", projetId, { activites: v.raci.lignes.length });
  return { ok: true, avertissements: v.avertissements };
}

/** Revenir au RACI type : le RACI propre du projet est effacé. */
export async function revenirAuRaciType(a: Acces, projetId: string): Promise<{ ok: true } | { erreur: string }> {
  const refus = await projetGere(a, projetId);
  if (refus) return refus;
  await db.delete(schema.raci).where(eq(schema.raci.cle, projetId));
  await noter(a.moi.id, "raci_projet_type", projetId);
  return { ok: true };
}

/** Sous chaque rôle, les noms des personnes du projet (sponsor, chef et référent, membres actifs de l'équipe). */
export async function nomsPourRaci(p: { id: string; sponsorId: string | null; chefProjetId: string | null; referentId: string | null }, r: Raci, max = 3): Promise<string[]> {
  const [org, membres] = await Promise.all([chargerOrganisation(), db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, p.id))]);
  const nom = (id: string | null) => {
    const x = id ? org.personnes.get(id) : undefined;
    return x ? nomComplet(x) : null;
  };
  const equipe = membres
    .map((m) => org.personnes.get(m.id))
    .filter((x): x is NonNullable<typeof x> => !!x && x.actif)
    .map((x) => nomComplet(x))
    .sort((x, y) => x.localeCompare(y, "fr"));
  return r.colonnes.map((c) => nomsDuRole(c.qui, { sponsor: nom(p.sponsorId), chef: nom(p.chefProjetId), referent: nom(p.referentId), equipe }, max));
}
