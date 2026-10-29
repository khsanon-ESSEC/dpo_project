/**
 * Kit de démarrage d'un projet validé (29 octobre 2026) : ce que la fiche du projet permet de proposer (règles :
 * src/lib/kit.ts), et l'ajout de ce que le chef de projet a coché. Pour qui gère le projet. Les actions vérifient que
 * la personne voit le projet ; ces fonctions vérifient le reste.
 */
import "server-only";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { cadrageValide } from "@/lib/cadrage";
import { noter } from "@/lib/journal";
import { kitDeDemarrage, type KitDeDemarrage } from "@/lib/kit";
import { MAX_PAR_GENRE } from "@/lib/objectifs";
import { chargerOrganisation } from "@/lib/organisation";
import { peutGererProjet } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { acteur } from "./gestion";
import { ajouterMembre } from "./gestion";
import { recalculerSante } from "./sante";

type Projet = typeof schema.projets.$inferSelect;

/** Un projet accepté, en cours ou en attente, ni archivé ni finalisé : le seul qui reçoit un kit. */
export const projetPourKit = (p: Pick<Projet, "statut" | "archiveLe">) => !p.archiveLe && (p.statut === "en_attente" || p.statut === "en_cours" || p.statut === "continu");

/** Le kit proposé pour ce projet, à partir de sa fiche et de ce qu'il a déjà. */
export async function kitDuProjet(p: Projet): Promise<KitDeDemarrage> {
  const [phases, livrables, risques, benefices, membres, org] = await Promise.all([
    db.select().from(schema.phasesProjet).where(eq(schema.phasesProjet.projetId, p.id)).orderBy(asc(schema.phasesProjet.ordre)),
    db.select({ libelle: schema.indicateurs.libelle }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, p.id)),
    db.select({ titre: schema.risquesProjet.titre }).from(schema.risquesProjet).where(eq(schema.risquesProjet.projetId, p.id)),
    db.select({ libelle: schema.objectifsProjet.libelle }).from(schema.objectifsProjet).where(and(eq(schema.objectifsProjet.projetId, p.id), eq(schema.objectifsProjet.genre, "benefice"))),
    db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, p.id)),
    chargerOrganisation(),
  ]);
  const equipes = [...org.equipes.values()].map((e) => {
    const chef = e.chefId ? org.personnes.get(e.chefId) : undefined;
    return { nom: e.nom, chefId: chef?.actif ? chef.id : null, chefNom: chef?.actif ? nomComplet(chef) : null };
  });
  return kitDeDemarrage(
    cadrageValide(p.cadrage),
    {
      dateEntree: p.dateEntree,
      dateFinPrevue: p.dateFinPrevue,
      phases: phases.map((x) => ({ nom: x.nom, debut: x.debut, fin: x.fin })),
      livrables: livrables.map((x) => x.libelle),
      risques: risques.map((x) => x.titre),
      benefices: benefices.map((x) => x.libelle),
      placesBenefices: MAX_PAR_GENRE - benefices.length,
      equipe: [p.chefProjetId, p.referentId, ...membres.map((m) => m.id)].filter((x): x is string => !!x),
    },
    equipes,
  );
}

async function droits(a: Acces, projetId: string): Promise<{ erreur: string } | { p: Projet }> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return { erreur: "Projet introuvable." };
  if (!peutGererProjet(acteur(a), p)) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs utilisent le kit de démarrage." };
  if (!projetPourKit(p)) return { erreur: "Le kit de démarrage sert aux projets acceptés et en cours." };
  return { p };
}

export type BilanKit = { phases: number; livrables: number; risques: number; benefices: number; personnes: number };

/**
 * Ajouter au projet les éléments cochés du kit (leurs clés ; « phases » pour les phases types). Le kit est recalculé
 * ici, à partir de la base : seules ses propres clés comptent. Les livrables et les risques sont confiés au chef de
 * projet (il les réattribue) ; il reçoit une seule alerte, s'il n'a pas fait l'ajout lui-même.
 */
export async function appliquerKit(a: Acces, projetId: string, choisis: Set<string>): Promise<{ ok: true; bilan: BilanKit } | { erreur: string }> {
  const r = await droits(a, projetId);
  if ("erreur" in r) return { erreur: r.erreur };
  const p = r.p;
  const kit = await kitDuProjet(p);
  const bilan: BilanKit = { phases: 0, livrables: 0, risques: 0, benefices: 0, personnes: 0 };
  const chef = p.chefProjetId;

  // Phases types (seulement si le projet n'en a pas : le kit ne les propose pas sinon).
  if (choisis.has("phases") && kit.phases.length) {
    await db.insert(schema.phasesProjet).values(kit.phases.map((x, i) => ({ projetId, ordre: i + 1, ...x })));
    bilan.phases = kit.phases.length;
  }
  const phases = await db.select({ id: schema.phasesProjet.id, nom: schema.phasesProjet.nom, fin: schema.phasesProjet.fin }).from(schema.phasesProjet).where(eq(schema.phasesProjet.projetId, projetId));
  const phaseDe = (nom: string) => phases.find((x) => x.nom.toLowerCase() === nom.toLowerCase());

  const livrables = kit.livrables.filter((x) => choisis.has(x.cle));
  if (livrables.length) {
    const [{ m }] = await db.select({ m: max(schema.indicateurs.ordre) }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId));
    await db.insert(schema.indicateurs).values(
      livrables.map((x, i) => {
        const ph = phaseDe(x.phase);
        return { projetId, libelle: x.libelle, ordre: (m ?? 0) + i + 1, critere: x.critere, phaseId: ph?.id ?? null, prevuLe: ph?.fin ?? x.prevuLe, responsableId: chef };
      }),
    );
    bilan.livrables = livrables.length;
  }

  const risques = kit.risques.filter((x) => choisis.has(x.cle));
  if (risques.length) {
    await db.insert(schema.risquesProjet).values(risques.map((x) => ({ projetId, titre: x.titre, probabilite: x.probabilite, impact: x.impact, reponse: x.reponse, responsableId: chef, auteurId: a.moi.id })));
    bilan.risques = risques.length;
  }

  const benefices = kit.benefices.filter((x) => choisis.has(x.cle));
  if (benefices.length) {
    const [{ m }] = await db.select({ m: max(schema.objectifsProjet.ordre) }).from(schema.objectifsProjet).where(and(eq(schema.objectifsProjet.projetId, projetId), eq(schema.objectifsProjet.genre, "benefice")));
    await db.insert(schema.objectifsProjet).values(benefices.map((x, i) => ({ projetId, genre: "benefice" as const, ordre: (m ?? 0) + i + 1, libelle: x.libelle, indicateur: x.indicateur })));
    bilan.benefices = benefices.length;
  }

  for (const x of kit.personnes.filter((y) => choisis.has(y.cle))) {
    await ajouterMembre(projetId, x.personneId, x.role, a.moi.id);
    bilan.personnes += 1;
  }

  await db.update(schema.projets).set({ kitLe: new Date(), kitParId: a.moi.id }).where(eq(schema.projets.id, projetId));
  if (chef && chef !== a.moi.id && (bilan.livrables || bilan.risques)) {
    await db.insert(schema.notifications).values({
      personneId: chef,
      type: "projet",
      texte: `Kit de démarrage ajouté au projet « ${p.titre} » : ${bilan.livrables} livrable${bilan.livrables > 1 ? "s" : ""} et ${bilan.risques} risque${bilan.risques > 1 ? "s" : ""} vous sont confiés, à répartir`,
      lien: `/projets/${projetId}#livrables`,
    });
  }
  await noter(a.moi.id, "kit_applique", projetId, bilan);
  await recalculerSante([projetId]);
  return { ok: true, bilan };
}

/** « Ne pas utiliser le kit » : la fiche du projet ne le propose plus (la page du kit reste ouverte). */
export async function ecarterKit(a: Acces, projetId: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await droits(a, projetId);
  if ("erreur" in r) return { erreur: r.erreur };
  await db.update(schema.projets).set({ kitLe: new Date(), kitParId: a.moi.id }).where(and(eq(schema.projets.id, projetId), isNull(schema.projets.kitLe)));
  await noter(a.moi.id, "kit_ecarte", projetId);
  return { ok: true };
}
