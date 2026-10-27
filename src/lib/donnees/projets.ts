import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, ecartJours, premierDuMois } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { initiales, nomComplet } from "@/lib/regles";
import { idsProjetsVisibles, type Acces } from "@/lib/acces";
import { resumesProjets } from "./semaine";

/** Fin prévue au dernier rapport au conseil (ou, à défaut, fin initiale). */
async function finsAuDernierRapport(ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const debutMois = premierDuMois(aujourdhui());
  const lignes = await db
    .select({ projetId: schema.historiqueProjet.projetId, mois: schema.historiqueProjet.mois, fin: schema.historiqueProjet.dateFinPrevue })
    .from(schema.historiqueProjet)
    .where(and(inArray(schema.historiqueProjet.projetId, ids), lt(schema.historiqueProjet.mois, debutMois)))
    .orderBy(desc(schema.historiqueProjet.mois));
  const m = new Map<string, string | null>();
  for (const l of lignes) if (!m.has(l.projetId)) m.set(l.projetId, l.fin);
  return m;
}

/**
 * Portefeuille : les projets acceptés que la personne voit (sans les demandes ni les refus). Les projets
 * archivés n'y sont pas, sauf quand on les demande (« Archivés »).
 */
export async function portefeuille(a: Acces, options: { archives?: boolean } = {}) {
  const visibles = await idsProjetsVisibles(a);
  const candidats = await db
    .select({ id: schema.projets.id, statut: schema.projets.statut, archiveLe: schema.projets.archiveLe })
    .from(schema.projets)
    .where(and(ne(schema.projets.statut, "requete"), ne(schema.projets.statut, "refuse")));
  const ids = candidats
    .filter((p) => (options.archives ? !!p.archiveLe : !p.archiveLe && (visibles !== "tous" || p.statut !== "finalise")))
    .map((p) => p.id)
    .filter((id) => visibles === "tous" || visibles.has(id));
  const projets = await resumesProjets(ids, a.moi.id);
  const anciennes = await finsAuDernierRapport(ids);
  const equipes = ids.length
    ? await db.selectDistinct({ projetId: schema.taches.projetId, assigneId: schema.taches.assigneId }).from(schema.taches).where(and(inArray(schema.taches.projetId, ids), isNull(schema.taches.annuleeLe)))
    : [];
  const org = await chargerOrganisation();
  const membresProjets = ids.length ? await db.select({ projetId: schema.membresProjet.projetId, personneId: schema.membresProjet.personneId }).from(schema.membresProjet).where(inArray(schema.membresProjet.projetId, ids)) : [];
  return projets.map((p) => {
    const ancienne = anciennes.get(p.id) ?? null;
    const glissementJours = ancienne && p.dateFinPrevue ? ecartJours(ancienne, p.dateFinPrevue) : 0;
    const membres = new Set([...membresProjets.filter((m) => m.projetId === p.id).map((m) => m.personneId), ...equipes.filter((e) => e.projetId === p.id).map((e) => e.assigneId)]);
    if (p.chefProjetId) membres.add(p.chefProjetId);
    return {
      ...p,
      ancienneFin: ancienne,
      glissementSemaines: Math.round(glissementJours / 7),
      equipe: [...membres].slice(0, 4).map((id) => initiales(org.personnes.get(id) ?? { prenom: "?", nom: "?" })),
    };
  });
}

export async function ficheProjet(projetId: string) {
  const [projet] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  const indicateurs = await db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId)).orderBy(asc(schema.indicateurs.ordre));
  const taches = await db
    .select({ id: schema.taches.id, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, assigneId: schema.taches.assigneId })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)))
    .orderBy(asc(schema.taches.echeance));
  const historique = await db.select().from(schema.historiqueProjet).where(eq(schema.historiqueProjet.projetId, projetId)).orderBy(desc(schema.historiqueProjet.mois));
  const org = await chargerOrganisation();
  const jour = aujourdhui();
  const compte = { faite: 0, en_cours: 0, a_faire: 0, bloquee: 0 } as Record<string, number>;
  for (const t of taches) compte[t.statut] += 1;
  const ouvertes = taches.filter((t) => t.statut !== "faite");
  const urgentes = ouvertes
    .map((t) => ({ ...t, retard: t.statut !== "bloquee" && !!t.echeance && t.echeance < jour }))
    .sort((x, y) => Number(y.retard) - Number(x.retard) || Number(y.statut === "bloquee") - Number(x.statut === "bloquee") || (x.echeance ?? "9").localeCompare(y.echeance ?? "9"))
    .slice(0, 4)
    .map((t) => ({ ...t, initiales: initiales(org.personnes.get(t.assigneId)!) }));
  const membres = new Map<string, number>();
  for (const t of ouvertes) membres.set(t.assigneId, (membres.get(t.assigneId) ?? 0) + 1);
  const chef = projet.chefProjetId ? org.personnes.get(projet.chefProjetId) : null;
  const equipe = [
    ...(chef ? [{ id: chef.id, nom: nomComplet(chef), initiales: initiales(chef), detail: "Chef de projet" }] : []),
    ...[...membres.entries()]
      .filter(([id]) => id !== chef?.id)
      .map(([id, n]) => ({ id, nom: nomComplet(org.personnes.get(id)!), initiales: initiales(org.personnes.get(id)!), detail: `${n} tâche${n > 1 ? "s" : ""}` })),
  ];
  const dernier = historique.find((h) => h.mois < premierDuMois(jour)) ?? null;
  return {
    projet,
    chef: chef ? { nom: nomComplet(chef), initiales: initiales(chef) } : null,
    indicateurs,
    compte,
    nTaches: taches.length,
    urgentes,
    equipe,
    dernier,
  };
}

export async function nomsProjets(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre }).from(schema.projets).where(inArray(schema.projets.id, ids));
}

/** Projets auxquels on peut rattacher une tâche, une ligne ou une réunion : acceptés, pas finalisés, pas archivés. */
export async function tousLesProjetsActifs() {
  return db
    .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre })
    .from(schema.projets)
    .where(and(ne(schema.projets.statut, "finalise"), ne(schema.projets.statut, "requete"), ne(schema.projets.statut, "refuse"), isNull(schema.projets.archiveLe)))
    .orderBy(asc(schema.projets.titre));
}

export async function mettreAJourIndicateur(indicateurId: string, etat: "a_venir" | "en_cours" | "atteint") {
  await db
    .update(schema.indicateurs)
    .set({ etat, atteintLe: etat === "atteint" ? sql`coalesce(${schema.indicateurs.atteintLe}, current_date)` : null })
    .where(eq(schema.indicateurs.id, indicateurId));
}

/** Toutes les tâches d'un projet, avec la personne et les dates utiles aux vues (liste, tableau, Gantt, calendrier). */
export async function tachesDuProjet(projetId: string) {
  const lignes = await db
    .select({
      id: schema.taches.id,
      titre: schema.taches.titre,
      statut: schema.taches.statut,
      debut: schema.taches.debut,
      echeance: schema.taches.echeance,
      estimationHeures: schema.taches.estimationHeures,
      assigneId: schema.taches.assigneId,
      projetId: schema.taches.projetId,
      blocage: schema.taches.blocage,
      termineeLe: schema.taches.termineeLe,
    })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)))
    .orderBy(asc(schema.taches.echeance), asc(schema.taches.titre));
  const org = await chargerOrganisation();
  const jour = aujourdhui();
  return lignes.map((t) => {
    const p = org.personnes.get(t.assigneId);
    return {
      ...t,
      personne: p ? nomComplet(p) : "?",
      prenom: p?.prenom ?? "?",
      initiales: p ? initiales(p) : "?",
      retard: t.statut !== "faite" && t.statut !== "bloquee" && !!t.echeance && t.echeance < jour,
    };
  });
}
export type TacheDuProjet = Awaited<ReturnType<typeof tachesDuProjet>>[number];
