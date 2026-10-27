/** Rapport du vendredi : brouillon préparé à partir des tâches, envoi, lecture filtrée. */
import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui, dateLocale, lundiDe } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { membresDeLaDirection, nomComplet, peutVoirRapportComplet, resoudreSuperieur } from "@/lib/regles";
import type { Acces } from "@/lib/acces";

export type Partie = "fait" | "en_cours" | "bloque" | "prochaine";
export const PARTIES: { id: Partie; libelle: string }[] = [
  { id: "fait", libelle: "Fait" },
  { id: "en_cours", libelle: "En cours" },
  { id: "bloque", libelle: "Bloqué" },
  { id: "prochaine", libelle: "La semaine prochaine" },
];

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

export function semaineCourante() {
  return lundiDe(aujourdhui());
}

/** Début et fin (exclue) de la semaine, en heure locale de la division. */
function bornes(semaine: string) {
  return {
    debut: sql`(${semaine}::date)::timestamp at time zone ${TZ}`,
    fin: sql`(${ajouterJours(semaine, 7)}::date)::timestamp at time zone ${TZ}`,
  };
}

type LignePrevue = { partie: Partie; texte: string; projetId: string | null; tacheId: string };

/** Brouillon par règles simples, sans IA : ce qui a été fait, en cours, bloqué, prévu. */
export async function brouillonParRegles(auteurId: string, semaine: string): Promise<LignePrevue[]> {
  const { debut, fin } = bornes(semaine);
  const taches = await db.select().from(schema.taches).where(eq(schema.taches.assigneId, auteurId)).orderBy(asc(schema.taches.echeance));
  const notes = await db
    .select({ tacheId: schema.evenementsTache.tacheId, note: schema.evenementsTache.note })
    .from(schema.evenementsTache)
    .innerJoin(schema.taches, eq(schema.taches.id, schema.evenementsTache.tacheId))
    .where(and(eq(schema.taches.assigneId, auteurId), eq(schema.evenementsTache.type, "note"), sql`${schema.evenementsTache.creeLe} >= ${debut}`, sql`${schema.evenementsTache.creeLe} < ${fin}`))
    .orderBy(asc(schema.evenementsTache.creeLe));
  const derniereNote = new Map(notes.map((n) => [n.tacheId, n.note ?? ""]));

  const dimanche = ajouterJours(semaine, 6);
  const dansLaSemaine = (d: Date | null) => {
    if (!d) return false;
    const j = dateLocale(d);
    return j >= semaine && j <= dimanche;
  };
  const limite = ajouterJours(semaine, 13);
  const lignes: LignePrevue[] = [];
  for (const t of taches) {
    const base = { projetId: t.projetId, tacheId: t.id };
    if (t.statut === "faite" && dansLaSemaine(t.termineeLe)) lignes.push({ ...base, partie: "fait", texte: t.titre });
    if (t.statut === "en_cours") {
      const note = derniereNote.get(t.id);
      lignes.push({ ...base, partie: "en_cours", texte: note ? `${t.titre}, ${note.charAt(0).toLowerCase()}${note.slice(1)}` : t.titre });
    }
    if (t.statut === "bloquee") lignes.push({ ...base, partie: "bloque", texte: t.blocage ? `${t.titre} : ${t.blocage}` : t.titre });
  }
  const prevues = taches.filter((t) => (t.statut === "a_faire" || t.statut === "en_cours") && (!t.echeance || t.echeance <= limite)).slice(0, 5);
  for (const t of prevues) lignes.push({ partie: "prochaine", texte: t.titre, projetId: t.projetId, tacheId: t.id });
  return lignes;
}

export async function obtenirOuCreerRapport(auteurId: string, semaine = semaineCourante()) {
  const [existant] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.semaine, semaine)))
    .limit(1);
  if (existant) return existant;
  const lignes = await brouillonParRegles(auteurId, semaine);
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(schema.rapportsHebdo)
      .values({ auteurId, semaine })
      .onConflictDoNothing()
      .returning();
    if (!r) {
      const [deja] = await tx.select().from(schema.rapportsHebdo).where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.semaine, semaine)));
      return deja;
    }
    if (lignes.length) {
      await tx.insert(schema.lignesRapport).values(lignes.map((l, i) => ({ ...l, rapportId: r.id, ordre: i + 1 })));
    }
    return r;
  });
}

export async function lignesDuRapport(rapportId: string) {
  return db
    .select({
      id: schema.lignesRapport.id,
      partie: schema.lignesRapport.partie,
      texte: schema.lignesRapport.texte,
      ordre: schema.lignesRapport.ordre,
      projetId: schema.lignesRapport.projetId,
      projetCode: schema.projets.code,
      projetTitre: schema.projets.titre,
      projetChefId: schema.projets.chefProjetId,
    })
    .from(schema.lignesRapport)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.lignesRapport.projetId))
    .where(eq(schema.lignesRapport.rapportId, rapportId))
    .orderBy(asc(schema.lignesRapport.ordre));
}

/** Qui lira ce rapport : le supérieur en entier, chaque chef de projet sa partie. */
export async function lecteursDuRapport(auteurId: string, lignes: Awaited<ReturnType<typeof lignesDuRapport>>) {
  const org = await chargerOrganisation();
  const sup = resoudreSuperieur(org, auteurId);
  // Directeurs au-dessus de l'auteur : ils voient tout le rapport (sa direction). Les exécutifs aussi.
  const directeurs = [...org.personnes.values()].filter(
    (p) => p.actif && p.directeur && !p.executif && p.id !== auteurId && p.id !== sup?.id && membresDeLaDirection(org, p.id).has(auteurId),
  );
  const voientTout = new Set([auteurId, sup?.id, ...directeurs.map((d) => d.id)]);
  const parChef = new Map<string, { code: string; titre: string; n: number }>();
  for (const l of lignes) {
    if (!l.projetChefId || voientTout.has(l.projetChefId) || org.personnes.get(l.projetChefId)?.executif) continue;
    const c = parChef.get(l.projetChefId) ?? { code: l.projetCode ?? "", titre: l.projetTitre ?? "", n: 0 };
    c.n += 1;
    parChef.set(l.projetChefId, c);
  }
  return {
    superieur: sup ? { id: sup.id, nom: nomComplet(sup), poste: sup.poste, prenom: sup.prenom } : null,
    directeurs: directeurs.map((d) => ({ id: d.id, nom: nomComplet(d), poste: d.poste })),
    chefs: [...parChef.entries()].map(([id, c]) => {
      const p = org.personnes.get(id)!;
      return { id, nom: nomComplet(p), prenom: p.prenom, ...c };
    }),
  };
}

export async function envoyerRapport(rapportId: string, auteurId: string) {
  const org = await chargerOrganisation();
  const sup = resoudreSuperieur(org, auteurId);
  const [r] = await db
    .update(schema.rapportsHebdo)
    .set({ statut: "envoye", destinataireId: sup?.id ?? null, envoyeLe: new Date(), majLe: new Date() })
    .where(and(eq(schema.rapportsHebdo.id, rapportId), eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.statut, "brouillon")))
    .returning();
  if (!r) return null;
  const auteur = org.personnes.get(auteurId)!;
  const lignes = await lignesDuRapport(rapportId);
  const notifs: (typeof schema.notifications.$inferInsert)[] = [];
  if (sup) notifs.push({ personneId: sup.id, type: "rapport_recu", texte: `Rapport du vendredi de ${nomComplet(auteur)}`, lien: `/rapports/${rapportId}` });
  const { chefs } = await lecteursDuRapport(auteurId, lignes);
  for (const c of chefs) {
    notifs.push({ personneId: c.id, type: "rapport_recu", texte: `${nomComplet(auteur)} : ${c.n} ligne${c.n > 1 ? "s" : ""} sur ${c.titre}`, lien: `/rapports/${rapportId}` });
  }
  if (notifs.length) await db.insert(schema.notifications).values(notifs);
  await noter(auteurId, "rapport_envoye", rapportId, { destinataire: sup?.id ?? null, chefs: chefs.map((c) => c.id) });
  return r;
}

/** Lecture d'un rapport : complet, ou réduit aux lignes des projets que je dirige. */
export async function lireRapport(a: Acces, rapportId: string) {
  const [r] = await db.select().from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.id, rapportId)).limit(1);
  if (!r) return null;
  const org = await chargerOrganisation();
  const lignes = await lignesDuRapport(r.id);
  if (peutVoirRapportComplet(org, a.moi, r)) return { rapport: r, lignes, complet: true, auteur: org.personnes.get(r.auteurId)! };
  if (r.statut !== "envoye") return null;
  const miennes = lignes.filter((l) => l.projetChefId === a.moi.id);
  if (!miennes.length) return null;
  return { rapport: r, lignes: miennes, complet: false, auteur: org.personnes.get(r.auteurId)! };
}

/** Lignes envoyées cette semaine sur un projet, regroupées par auteur (fiche projet). */
export async function lignesDuProjetCetteSemaine(projetId: string, auteurs: "toutes" | Set<string>, semaine = semaineCourante()) {
  const lignes = await db
    .select({
      auteurId: schema.rapportsHebdo.auteurId,
      envoyeLe: schema.rapportsHebdo.envoyeLe,
      partie: schema.lignesRapport.partie,
      texte: schema.lignesRapport.texte,
      ordre: schema.lignesRapport.ordre,
    })
    .from(schema.lignesRapport)
    .innerJoin(schema.rapportsHebdo, eq(schema.rapportsHebdo.id, schema.lignesRapport.rapportId))
    .where(and(eq(schema.lignesRapport.projetId, projetId), eq(schema.rapportsHebdo.semaine, semaine), eq(schema.rapportsHebdo.statut, "envoye")))
    .orderBy(asc(schema.rapportsHebdo.envoyeLe), asc(schema.lignesRapport.ordre));
  const org = await chargerOrganisation();
  const parAuteur = new Map<string, { auteur: string; prenom: string; nom: string; envoyeLe: Date | null; lignes: { partie: Partie; texte: string }[] }>();
  for (const l of lignes) {
    if (auteurs !== "toutes" && !auteurs.has(l.auteurId)) continue;
    const p = org.personnes.get(l.auteurId)!;
    const g = parAuteur.get(l.auteurId) ?? { auteur: nomComplet(p), prenom: p.prenom, nom: p.nom, envoyeLe: l.envoyeLe, lignes: [] };
    g.lignes.push({ partie: l.partie, texte: l.texte });
    parAuteur.set(l.auteurId, g);
  }
  return [...parAuteur.values()];
}

/** Statut des rapports de la semaine pour une liste de personnes. */
export async function statutsRapports(personneIds: string[], semaine = semaineCourante()) {
  if (!personneIds.length) return new Map<string, { id: string; statut: "brouillon" | "envoye"; envoyeLe: Date | null }>();
  const lignes = await db
    .select({ id: schema.rapportsHebdo.id, auteurId: schema.rapportsHebdo.auteurId, statut: schema.rapportsHebdo.statut, envoyeLe: schema.rapportsHebdo.envoyeLe })
    .from(schema.rapportsHebdo)
    .where(and(inArray(schema.rapportsHebdo.auteurId, personneIds), eq(schema.rapportsHebdo.semaine, semaine)));
  return new Map(lignes.map((l) => [l.auteurId, l]));
}
