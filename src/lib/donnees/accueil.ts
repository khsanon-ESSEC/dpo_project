/**
 * Première connexion guidée côté serveur (src/lib/accueil.ts) : quels gestes la personne a déjà faits. Seulement
 * ses propres données (ses tâches, ses rapports, les écrans qu'elle a ouverts), lues pour elle seule.
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { gestesAccueil, GESTES, profilAccueil, type CleGeste, type Geste } from "@/lib/accueil";
import { noter } from "@/lib/journal";

const existe = async (q: Promise<unknown[]>) => (await q).length > 0;

export async function accueilDe(a: Acces): Promise<Geste[] | null> {
  const u = a.moi;
  const [p] = await db.select({ ferme: schema.personnes.accueilFermeLe }).from(schema.personnes).where(eq(schema.personnes.id, u.id));
  if (!p || p.ferme) return null;
  const profil = profilAccueil({ externe: u.externe, executif: u.executif, directeur: u.directeur, equipeDirecte: a.equipeDirecte.length });
  const cles = new Set(GESTES[profil].map((g) => g.cle));
  const vu = (ecran: string) => existe(db.select({ x: sql`1` }).from(schema.consultations).where(and(eq(schema.consultations.personneId, u.id), eq(schema.consultations.ecran, ecran))).limit(1));
  const tests: Record<CleGeste, () => Promise<boolean>> = {
    tache_creee: () => existe(db.select({ x: sql`1` }).from(schema.taches).where(eq(schema.taches.creeParId, u.id)).limit(1)),
    tache_faite: () => existe(db.select({ x: sql`1` }).from(schema.taches).where(and(eq(schema.taches.assigneId, u.id), eq(schema.taches.statut, "faite"))).limit(1)),
    rapport_envoye: () => existe(db.select({ x: sql`1` }).from(schema.rapportsHebdo).where(and(eq(schema.rapportsHebdo.auteurId, u.id), eq(schema.rapportsHebdo.statut, "envoye"))).limit(1)),
    tache_confiee: () => existe(db.select({ x: sql`1` }).from(schema.taches).where(and(eq(schema.taches.creeParId, u.id), ne(schema.taches.assigneId, u.id))).limit(1)),
    rapport_lu: () => existe(db.select({ x: sql`1` }).from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.luPar, u.id)).limit(1)),
    charge_vue: () => vu("/charge"),
    portefeuille_vu: () => vu("/projets"),
    conseil_vu: () => vu("/conseil"),
    tache_a_jour: () => existe(db.select({ x: sql`1` }).from(schema.taches).where(and(eq(schema.taches.assigneId, u.id), inArray(schema.taches.statut, ["en_cours", "bloquee", "faite"]))).limit(1)),
    temps_note: () => existe(db.select({ x: sql`1` }).from(schema.tempsPasse).where(eq(schema.tempsPasse.personneId, u.id)).limit(1)),
  };
  const faits = new Set<CleGeste>();
  await Promise.all([...cles].map(async (c) => (await tests[c]()) && faits.add(c)));
  return gestesAccueil(profil, faits, false);
}

/** « Masquer » : la carte ne revient plus. */
export async function fermerAccueilDe(personneId: string) {
  await db.update(schema.personnes).set({ accueilFermeLe: new Date() }).where(eq(schema.personnes.id, personneId));
  await noter(personneId, "accueil_ferme");
}
