import "server-only";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui, dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, resoudreSuperieur } from "@/lib/regles";
import { semaineCourante, statutsRapports } from "./rapport";

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

export type TacheListe = {
  id: string;
  titre: string;
  statut: "a_faire" | "en_cours" | "bloquee" | "faite";
  echeance: string | null;
  projetCode: string | null;
  projetTitre: string | null;
  assigneId: string;
};

export async function tachesDe(personneIds: string[], options: { semaine?: string } = {}) {
  if (!personneIds.length) return [] as (TacheListe & { termineeLe: Date | null })[];
  const semaine = options.semaine ?? semaineCourante();
  const lignes = await db
    .select({
      id: schema.taches.id,
      titre: schema.taches.titre,
      statut: schema.taches.statut,
      echeance: schema.taches.echeance,
      termineeLe: schema.taches.termineeLe,
      assigneId: schema.taches.assigneId,
      projetCode: schema.projets.code,
      projetTitre: schema.projets.titre,
    })
    .from(schema.taches)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(inArray(schema.taches.assigneId, personneIds))
    .orderBy(asc(schema.taches.echeance), asc(schema.taches.titre));
  const dimanche = ajouterJours(semaine, 6);
  return lignes.filter((t) => t.statut !== "faite" || (t.termineeLe && dateLocale(t.termineeLe) >= semaine && dateLocale(t.termineeLe) <= dimanche));
}

export function compter(taches: TacheListe[], jour = aujourdhui()) {
  const ouvertes = taches.filter((t) => t.statut !== "faite");
  const retard = ouvertes.filter((t) => t.statut !== "bloquee" && t.echeance !== null && t.echeance < jour).length;
  const bloquees = ouvertes.filter((t) => t.statut === "bloquee").length;
  return {
    faites: taches.length - ouvertes.length,
    total: taches.length,
    retard,
    bloquees,
    aFaire: ouvertes.length - retard - bloquees,
  };
}

/** Ordre d'affichage : en retard, bloquées, puis par échéance. */
export function trier(taches: TacheListe[], jour = aujourdhui()) {
  const rang = (t: TacheListe) => (t.statut === "faite" ? 3 : t.statut === "bloquee" ? 1 : t.echeance && t.echeance < jour ? 0 : 2);
  return [...taches].sort((a, b) => rang(a) - rang(b) || (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"));
}

/** Nombre de mises à jour de tâches faites par la personne, chaque jour ouvré de la semaine (quatre points au plus). */
export async function activiteDeLaSemaine(personneId: string, semaine = semaineCourante()) {
  const debut = sql`(${semaine}::date)::timestamp at time zone ${TZ}`;
  const fin = sql`(${ajouterJours(semaine, 7)}::date)::timestamp at time zone ${TZ}`;
  const lignes = await db
    .select({ jour: sql<string>`to_char(${schema.evenementsTache.creeLe} at time zone ${TZ}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(schema.evenementsTache)
    .where(and(eq(schema.evenementsTache.auteurId, personneId), sql`${schema.evenementsTache.creeLe} >= ${debut}`, sql`${schema.evenementsTache.creeLe} < ${fin}`))
    .groupBy(sql`1`);
  const parJour = new Map(lignes.map((l) => [l.jour, l.n]));
  return [0, 1, 2, 3, 4].map((i) => {
    const j = ajouterJours(semaine, i);
    return { jour: j, n: Math.min(parJour.get(j) ?? 0, 4), total: parJour.get(j) ?? 0 };
  });
}

const LIBELLE_STATUT: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

export type FaitDuJour = { id: string; heure: Date; tacheId: string; titre: string; projetCode: string | null; texte: string; type: string };

/**
 * Une journée passée (ou celle d'aujourd'hui) : ce que la personne a fait sur ses tâches (créées,
 * changées d'état, notes, blocages, échéances déplacées), et les tâches qui arrivaient à échéance ce jour-là.
 */
export async function journeeDe(personneId: string, jour: string) {
  const debut = sql`(${jour}::date)::timestamp at time zone ${TZ}`;
  const fin = sql`(${ajouterJours(jour, 1)}::date)::timestamp at time zone ${TZ}`;
  const evenements = await db
    .select({
      id: schema.evenementsTache.id,
      type: schema.evenementsTache.type,
      avant: schema.evenementsTache.avant,
      apres: schema.evenementsTache.apres,
      note: schema.evenementsTache.note,
      creeLe: schema.evenementsTache.creeLe,
      tacheId: schema.taches.id,
      titre: schema.taches.titre,
      projetCode: schema.projets.code,
    })
    .from(schema.evenementsTache)
    .innerJoin(schema.taches, eq(schema.taches.id, schema.evenementsTache.tacheId))
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(eq(schema.evenementsTache.auteurId, personneId), sql`${schema.evenementsTache.creeLe} >= ${debut}`, sql`${schema.evenementsTache.creeLe} < ${fin}`))
    .orderBy(asc(schema.evenementsTache.creeLe));
  const faits: FaitDuJour[] = evenements.map((e) => {
    const t = `« ${e.titre} »`;
    const texte =
      e.type === "creation"
        ? `Tâche créée : ${t}`
        : e.type === "statut"
          ? `${t} : ${LIBELLE_STATUT[e.avant ?? ""] ?? e.avant ?? "?"} → ${LIBELLE_STATUT[e.apres ?? ""] ?? e.apres ?? "?"}${e.apres === "bloquee" && e.note ? ` (${e.note})` : ""}`
          : e.type === "blocage"
            ? `${t} toujours bloquée : ${e.note ?? ""}`
            : e.type === "echeance"
              ? `Échéance de ${t} déplacée${e.apres ? ` au ${e.apres.split("-").reverse().join("/")}` : ""}`
              : e.type === "note"
                ? `Note sur ${t} : ${e.note ?? ""}`
                : `${t} : ${e.type}`;
    return { id: e.id, heure: e.creeLe, tacheId: e.tacheId, titre: e.titre, projetCode: e.projetCode, texte, type: e.type };
  });
  const echeances = await db
    .select({ id: schema.taches.id, titre: schema.taches.titre, statut: schema.taches.statut, projetCode: schema.projets.code })
    .from(schema.taches)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(eq(schema.taches.assigneId, personneId), eq(schema.taches.echeance, jour)))
    .orderBy(asc(schema.taches.titre));
  return { faits, echeances: echeances.map((t) => ({ ...t, libelle: LIBELLE_STATUT[t.statut] })) };
}

export async function mesProjets(personneId: string) {
  const lignes = await db
    .selectDistinct({ id: schema.projets.id })
    .from(schema.projets)
    .leftJoin(schema.taches, and(eq(schema.taches.projetId, schema.projets.id), eq(schema.taches.assigneId, personneId), ne(schema.taches.statut, "faite")))
    .where(or(eq(schema.projets.chefProjetId, personneId), eq(schema.taches.assigneId, personneId)));
  return resumesProjets(lignes.map((l) => l.id), personneId);
}

export async function resumesProjets(ids: string[], personneId?: string) {
  if (!ids.length) return [];
  const projets = await db.select().from(schema.projets).where(inArray(schema.projets.id, ids)).orderBy(asc(schema.projets.creeLe));
  const ind = await db
    .select({ projetId: schema.indicateurs.projetId, total: sql<number>`count(*)::int`, atteints: sql<number>`count(*) filter (where ${schema.indicateurs.etat} = 'atteint')::int` })
    .from(schema.indicateurs)
    .where(inArray(schema.indicateurs.projetId, ids))
    .groupBy(schema.indicateurs.projetId);
  const parProjet = new Map(ind.map((i) => [i.projetId, i]));
  return projets.map((p) => ({
    ...p,
    atteints: parProjet.get(p.id)?.atteints ?? 0,
    totalIndicateurs: parProjet.get(p.id)?.total ?? 0,
    role: personneId && p.chefProjetId === personneId ? "Chef de projet" : "Membre",
  }));
}

export async function etatMonRapport(personneId: string) {
  const statuts = await statutsRapports([personneId]);
  const org = await chargerOrganisation();
  const sup = resoudreSuperieur(org, personneId);
  return { rapport: statuts.get(personneId) ?? null, superieur: sup ? nomComplet(sup) : null };
}
