import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { reunionsParJour } from "./reunions";
import { chargerOrganisation } from "@/lib/organisation";
import { chargeDUnePersonne, CAPACITE_PAR_DEFAUT, semainesAVenir, type ChargePersonne, type TacheCharge } from "@/lib/charge";
import { initiales, nomComplet } from "@/lib/regles";

export const NB_SEMAINES = 6;

export type TacheOuverte = TacheCharge & { titre: string; projetId: string | null; projetCode: string | null; projetTitre: string | null };

/** Tâches pas encore faites des personnes données. */
export async function tachesOuvertesDe(ids: string[]): Promise<TacheOuverte[]> {
  if (!ids.length) return [];
  return db
    .select({
      id: schema.taches.id,
      titre: schema.taches.titre,
      assigneId: schema.taches.assigneId,
      statut: schema.taches.statut,
      debut: schema.taches.debut,
      echeance: schema.taches.echeance,
      estimationHeures: schema.taches.estimationHeures,
      projetId: schema.taches.projetId,
      projetCode: schema.projets.code,
      projetTitre: schema.projets.titre,
    })
    .from(schema.taches)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(inArray(schema.taches.assigneId, ids), ne(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe)));
}

export async function capacites(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const lignes = await db.select({ id: schema.personnes.id, c: schema.personnes.capaciteHeures }).from(schema.personnes).where(inArray(schema.personnes.id, ids));
  return new Map(lignes.map((l) => [l.id, l.c ?? CAPACITE_PAR_DEFAUT]));
}

export type LigneCharge = {
  id: string;
  nom: string;
  initiales: string;
  poste: string;
  equipeId: string | null;
  equipe: string;
  capacite: number;
  charge: ChargePersonne;
  /** Réunions notées à partir d'aujourd'hui (heures par jour). */
  reunions: { jour: string; heures: number }[];
  taches: Map<string, TacheOuverte>;
};

/** Charge de chaque personne sur les semaines à venir (la première est la semaine en cours). */
export async function chargeDesPersonnes(ids: string[], nbSemaines = NB_SEMAINES) {
  const jour = aujourdhui();
  const semaines = semainesAVenir(jour, nbSemaines);
  const org = await chargerOrganisation();
  // La charge n'est mesurée que pour la division : les personnes hors division n'y figurent pas.
  const actifs = ids.filter((id) => org.personnes.get(id)?.actif && !org.personnes.get(id)?.externe);
  const [taches, caps, reunions] = await Promise.all([tachesOuvertesDe(actifs), capacites(actifs), reunionsParJour(actifs, jour, ajouterJours(semaines.at(-1)!, 6))]);
  const lignes: LigneCharge[] = actifs.map((id) => {
    const p = org.personnes.get(id)!;
    const siennes = taches.filter((t) => t.assigneId === id);
    const capacite = caps.get(id) ?? CAPACITE_PAR_DEFAUT;
    return {
      id,
      nom: nomComplet(p),
      initiales: initiales(p),
      poste: p.poste,
      equipeId: p.equipeId,
      equipe: p.equipeId ? (org.equipes.get(p.equipeId)?.nom ?? "") : "Sans équipe",
      capacite,
      charge: chargeDUnePersonne(siennes, semaines, capacite, jour, reunions.get(id) ?? []),
      reunions: reunions.get(id) ?? [],
      taches: new Map(siennes.map((t) => [t.id, t])),
    };
  });
  return { jour, semaines, lignes };
}

/**
 * Charge des personnes d'un projet : heures sur ce projet, et niveau de charge total
 * (tous projets confondus) pour savoir si on peut leur en confier davantage.
 */
export async function chargeDuProjet(projetId: string, chefProjetId: string | null, nbSemaines = NB_SEMAINES) {
  const assignes = await db
    .selectDistinct({ id: schema.taches.assigneId })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), ne(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe)));
  const ids = [...new Set([...(chefProjetId ? [chefProjetId] : []), ...assignes.map((a) => a.id)])];
  const { jour, semaines, lignes } = await chargeDesPersonnes(ids, nbSemaines);
  return {
    jour,
    semaines,
    membres: lignes.map((l) => {
      const surProjet = [...l.taches.values()].filter((t) => t.projetId === projetId);
      return {
        ...l,
        chefDeProjet: l.id === chefProjetId,
        projet: chargeDUnePersonne(surProjet, semaines, l.capacite, jour, l.reunions),
        nbTachesProjet: surProjet.length,
      };
    }),
  };
}

/** Charge par personne pour le formulaire de création de tâche (indication, pas d'interdiction). */
export async function indicationsDeCharge(ids: string[]) {
  const { lignes } = await chargeDesPersonnes(ids, NB_SEMAINES);
  return Object.fromEntries(
    lignes.map((l) => [l.id, { capacite: l.capacite, semaines: l.charge.semaines.map((s) => ({ semaine: s.semaine, heures: s.heures, capacite: s.capacite, niveau: s.niveau })) }]),
  ) as Record<string, { capacite: number; semaines: { semaine: string; heures: number | null; capacite: number; niveau: string }[] }>;
}
