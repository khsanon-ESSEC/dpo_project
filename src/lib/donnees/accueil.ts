/**
 * Première connexion guidée côté serveur (src/lib/accueil.ts) : quels gestes la personne a déjà faits. Seulement
 * ses propres données (ses tâches, ses rapports, ses réunions, les écrans qu'elle a ouverts), lues pour elle seule.
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { choisirGestes, gestesAccueil, GESTES, profilAccueil, type CleGeste, type Geste } from "@/lib/accueil";
import { noter } from "@/lib/journal";

const existe = async (q: Promise<unknown[]>) => (await q).length > 0;

/** Les gestes faits parmi ceux demandés. */
async function gestesFaits(personneId: string, cles: CleGeste[]): Promise<Set<CleGeste>> {
  const u = personneId;
  const un = { x: sql`1` };
  // Un écran ouvert (n'importe quel jour) : la table des écrans ouverts, pour la personne elle-même.
  const vu = (...ecrans: string[]) => existe(db.select(un).from(schema.consultations).where(and(eq(schema.consultations.personneId, u), inArray(schema.consultations.ecran, ecrans))).limit(1));
  const tests: Record<CleGeste, () => Promise<boolean>> = {
    tache_creee: () => existe(db.select(un).from(schema.taches).where(eq(schema.taches.creeParId, u)).limit(1)),
    tache_faite: () => existe(db.select(un).from(schema.taches).where(and(eq(schema.taches.assigneId, u), eq(schema.taches.statut, "faite"))).limit(1)),
    rapport_envoye: () => existe(db.select(un).from(schema.rapportsHebdo).where(and(eq(schema.rapportsHebdo.auteurId, u), eq(schema.rapportsHebdo.statut, "envoye"))).limit(1)),
    tache_a_jour: () => existe(db.select(un).from(schema.taches).where(and(eq(schema.taches.assigneId, u), inArray(schema.taches.statut, ["en_cours", "bloquee", "faite"]))).limit(1)),
    reunion_notee: () => existe(db.select(un).from(schema.reunions).where(eq(schema.reunions.noteeParId, u)).limit(1)),
    temps_note: () => existe(db.select(un).from(schema.tempsPasse).where(eq(schema.tempsPasse.personneId, u)).limit(1)),
    absence_notee: () => existe(db.select(un).from(schema.absences).where(eq(schema.absences.creeParId, u)).limit(1)),
    tache_confiee: () => existe(db.select(un).from(schema.taches).where(and(eq(schema.taches.creeParId, u), ne(schema.taches.assigneId, u))).limit(1)),
    // Lire les rapports de l'équipe : l'écran des rapports de l'équipe ouvert, ou un rapport lu comme destinataire.
    // (« Lu par » n'est noté que pour le destinataire : un directeur ou un exécutif qui lit le rapport d'un autre
    // niveau ne le note pas ; d'où l'écran ouvert.)
    rapport_lu: async () => (await vu("/equipe/rapports")) || existe(db.select(un).from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.luPar, u)).limit(1)),
    charge_vue: () => vu("/charge"),
    vues_projet: () => vu("/projets/[id]/gantt", "/projets/[id]/calendrier", "/projets/[id]/charge"),
    portefeuille_vu: () => vu("/projets"),
    conseil_vu: () => vu("/conseil"),
  };
  const faits = new Set<CleGeste>();
  await Promise.all(cles.map(async (c) => (await tests[c]()) && faits.add(c)));
  return faits;
}

/**
 * La carte de la personne : à la première ouverture, les gestes sont choisis parmi ceux pas encore faits et
 * gardés ; ensuite, ils se cochent au fil de ce qu'elle fait. null : pas de carte.
 */
export async function accueilDe(a: Acces): Promise<Geste[] | null> {
  const u = a.moi;
  const [p] = await db.select({ ferme: schema.personnes.accueilFermeLe, choisis: schema.personnes.accueilGestes }).from(schema.personnes).where(eq(schema.personnes.id, u.id));
  if (!p || p.ferme) return null;
  let choisis = p.choisis;
  if (!choisis) {
    const profil = profilAccueil({ externe: u.externe, executif: u.executif, directeur: u.directeur, equipeDirecte: a.equipeDirecte.length });
    const tous = GESTES[profil].map((g) => g.cle);
    choisis = choisirGestes(profil, await gestesFaits(u.id, tous));
    // Gardés tels quels (vide : la personne a déjà tout fait, la carte ne s'affichera pas).
    await db.update(schema.personnes).set({ accueilGestes: choisis }).where(eq(schema.personnes.id, u.id));
    if (!choisis.length) return null;
    return gestesAccueil(choisis, new Set(), false);
  }
  return gestesAccueil(choisis, await gestesFaits(u.id, choisis as CleGeste[]), false);
}

/** « Masquer » : la carte ne revient plus. */
export async function fermerAccueilDe(personneId: string) {
  await db.update(schema.personnes).set({ accueilFermeLe: new Date() }).where(eq(schema.personnes.id, personneId));
  await noter(personneId, "accueil_ferme");
}
