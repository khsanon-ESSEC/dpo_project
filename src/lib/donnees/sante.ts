/**
 * Recalcule la santé des projets (règles : src/lib/sante.ts) et l'enregistre sur le projet, avec son motif :
 * toutes les pages et les réponses de la barre lisent ensuite la même valeur. Appelé à l'ouverture du portefeuille
 * et d'une fiche projet, après chaque changement qui la touche, et par la tournée horaire du serveur.
 */
import "server-only";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { calculerSante, type DonneesSante } from "@/lib/sante";
import { apresLeLivrable } from "@/lib/projets";
import { criticite, phaseDepassee } from "@/lib/risques";

export async function recalculerSante(projetIds?: string[]): Promise<number> {
  if (projetIds && !projetIds.length) return 0;
  const jour = aujourdhui();
  const projets = await db
    .select()
    .from(schema.projets)
    .where(and(projetIds ? inArray(schema.projets.id, projetIds) : undefined, notInArray(schema.projets.statut, ["requete", "refuse"]), isNull(schema.projets.archiveLe)));
  if (!projets.length) return 0;
  const ids = projets.map((p) => p.id);
  const [jalons, taches, reports, org, risques, phases] = await Promise.all([
    db.select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, prevuLe: schema.indicateurs.prevuLe, etat: schema.indicateurs.etat }).from(schema.indicateurs).where(inArray(schema.indicateurs.projetId, ids)),
    db
      .select({ id: schema.taches.id, projetId: schema.taches.projetId, statut: schema.taches.statut, echeance: schema.taches.echeance, creeLe: schema.taches.creeLe, termineeLe: schema.taches.termineeLe, majLe: schema.taches.majLe, livrableId: schema.taches.livrableId })
      .from(schema.taches)
      .where(and(inArray(schema.taches.projetId, ids), isNull(schema.taches.annuleeLe))),
    db.select({ projetId: schema.reportsFinProjet.projetId, avant: schema.reportsFinProjet.avant, apres: schema.reportsFinProjet.apres, creeLe: schema.reportsFinProjet.creeLe }).from(schema.reportsFinProjet).where(inArray(schema.reportsFinProjet.projetId, ids)),
    chargerOrganisation(),
    db
      .select({ projetId: schema.risquesProjet.projetId, probabilite: schema.risquesProjet.probabilite, impact: schema.risquesProjet.impact })
      .from(schema.risquesProjet)
      .where(and(inArray(schema.risquesProjet.projetId, ids), eq(schema.risquesProjet.statut, "ouvert"))),
    db.select().from(schema.phasesProjet).where(inArray(schema.phasesProjet.projetId, ids)),
  ]);
  // Depuis quand une tâche est bloquée : le dernier passage à « bloquée » (à défaut, sa dernière mise à jour).
  const bloquees = taches.filter((t) => t.statut === "bloquee");
  const evenements = bloquees.length
    ? await db
        .select({ tacheId: schema.evenementsTache.tacheId, apres: schema.evenementsTache.apres, type: schema.evenementsTache.type, creeLe: schema.evenementsTache.creeLe })
        .from(schema.evenementsTache)
        .where(inArray(schema.evenementsTache.tacheId, bloquees.map((t) => t.id)))
    : [];
  const bloqueeDepuis = new Map<string, string>();
  for (const e of evenements) {
    if (e.apres !== "bloquee" && e.type !== "blocage") continue;
    const d = dateLocale(e.creeLe);
    if (!bloqueeDepuis.has(e.tacheId) || d > bloqueeDepuis.get(e.tacheId)!) bloqueeDepuis.set(e.tacheId, d);
  }

  let changes = 0;
  for (const p of projets) {
    const par = p.risqueParId ? org.personnes.get(p.risqueParId) : undefined;
    const d: DonneesSante = {
      statut: p.statut,
      dateFinPrevue: p.dateFinPrevue,
      livrables: jalons
        .filter((j) => j.projetId === p.id)
        .map((j) => ({
          prevuLe: j.prevuLe,
          atteint: j.etat === "atteint" || j.etat === "pret",
          tachesApres: taches.filter((t) => t.livrableId === j.id && apresLeLivrable(t, j.prevuLe)).length,
        })),
      taches: taches
        .filter((t) => t.projetId === p.id)
        .map((t) => ({
          statut: t.statut,
          echeance: t.echeance,
          creeLe: dateLocale(t.creeLe),
          termineeLe: t.termineeLe ? dateLocale(t.termineeLe) : null,
          bloqueeDepuis: t.statut === "bloquee" ? (bloqueeDepuis.get(t.id) ?? dateLocale(t.majLe)) : null,
        })),
      reports: reports.filter((r) => r.projetId === p.id).map((r) => ({ le: dateLocale(r.creeLe), avant: r.avant, apres: r.apres })),
      risque: p.risqueMotif && p.risqueLe ? { motif: p.risqueMotif, le: dateLocale(p.risqueLe), par: par ? nomComplet(par) : null } : null,
      risquesCritiques: risques.filter((r) => r.projetId === p.id && criticite(r.probabilite, r.impact) >= 6).length,
      phasesDepassees: phases
        .filter((ph) => ph.projetId === p.id && phaseDepassee(ph, jour))
        .sort((x, y) => x.ordre - y.ordre)
        .map((ph) => ({ nom: ph.nom, fin: ph.fin! })),
    };
    const { sante, raisons } = calculerSante(d, jour);
    const motif = raisons.join(" · ").slice(0, 500);
    if (sante === p.sante && motif === p.santeMotif) continue;
    await db
      .update(schema.projets)
      .set({ sante, santeMotif: motif, santeLe: sante !== p.sante ? new Date() : p.santeLe })
      .where(eq(schema.projets.id, p.id));
    changes += 1;
  }
  return changes;
}

/** Signaler un risque (ou le retirer, motif vide) : seulement par qui gère le projet ; la santé est recalculée. */
export async function signalerRisque(projetId: string, motif: string, parId: string) {
  const m = motif.replace(/\s+/g, " ").trim().slice(0, 300);
  await db
    .update(schema.projets)
    .set(m ? { risqueMotif: m.charAt(0).toUpperCase() + m.slice(1), risqueLe: new Date(), risqueParId: parId } : { risqueMotif: "", risqueLe: null, risqueParId: null })
    .where(eq(schema.projets.id, projetId));
  await recalculerSante([projetId]);
}
