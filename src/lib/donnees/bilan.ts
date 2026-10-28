/**
 * Bilan d'activité par personne et par période : tâches faites, réunions, rapports envoyés.
 * Règles de calcul : src/lib/bilan.ts.
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { mesurer, semainesDeRapport, type Mesures, type Periode, type TacheTerminee } from "@/lib/bilan";
import { aujourdhui, dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { capacites } from "./charge";
import { minutesDeReunion } from "./reunions";

/**
 * Début des données de l'application : premier jour où quelque chose est enregistré (tâche faite, réunion,
 * rapport envoyé), et première semaine où un rapport a été envoyé. Avant, il n'y a rien à comparer, et aucun
 * rapport n'était attendu (l'application n'était pas encore utilisée).
 */
export async function debutDesDonnees(): Promise<{ activite: string | null; rapports: string | null }> {
  const [r] = await db.execute<{ taches: string | null; reunions: string | null; rapports: string | null }>(sql`
    select (select to_char(min(terminee_le) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from taches where statut = 'faite' and annulee_le is null) as taches,
           (select min(jour) from reunions)::text as reunions,
           (select min(semaine) from rapports_hebdo where statut = 'envoye')::text as rapports`);
  const jours = [r?.taches ? dateLocale(new Date(r.taches)) : null, r?.reunions ?? null, r?.rapports ?? null].filter((x): x is string => !!x).sort();
  return { activite: jours[0] ?? null, rapports: r?.rapports ?? null };
}

/** Mesures de chaque personne sur chaque période (dans l'ordre des périodes). */
export async function bilans(personneIds: string[], periodes: Periode[]): Promise<Map<string, Mesures[]>> {
  const r = new Map<string, Mesures[]>();
  if (!personneIds.length || !periodes.length) return r;
  const jour = aujourdhui();
  const debut = periodes.reduce((m, p) => (p.debut < m ? p.debut : m), periodes[0].debut);
  const fin = periodes.reduce((m, p) => (p.fin > m ? p.fin : m), periodes[0].fin);
  const org = await chargerOrganisation();
  // Un jour de marge de chaque côté : la date de fin est convertie à l'heure locale ensuite.
  const debutLarge = new Date(`${debut}T00:00:00Z`);
  debutLarge.setUTCDate(debutLarge.getUTCDate() - 1);
  const finLarge = new Date(`${fin}T23:59:59Z`);
  finLarge.setUTCDate(finLarge.getUTCDate() + 1);
  const [debuts, faites, caps, rapports, ...reunions] = await Promise.all([
    debutDesDonnees(),
    db
      .select({ assigneId: schema.taches.assigneId, estimationHeures: schema.taches.estimationHeures, echeance: schema.taches.echeance, termineeLe: schema.taches.termineeLe })
      .from(schema.taches)
      .where(and(inArray(schema.taches.assigneId, personneIds), eq(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe), gte(schema.taches.termineeLe, debutLarge), lte(schema.taches.termineeLe, finLarge))),
    capacites(personneIds),
    db
      .select({ auteurId: schema.rapportsHebdo.auteurId, semaine: schema.rapportsHebdo.semaine })
      .from(schema.rapportsHebdo)
      .where(and(inArray(schema.rapportsHebdo.auteurId, personneIds), eq(schema.rapportsHebdo.statut, "envoye"), gte(schema.rapportsHebdo.semaine, debut), lte(schema.rapportsHebdo.semaine, fin))),
    ...periodes.map((p) => minutesDeReunion(personneIds, p.debut, p.fin)),
  ]);
  for (const id of personneIds) {
    const p = org.personnes.get(id);
    // Les exécutifs n'envoient pas de rapport : rien n'est attendu d'eux.
    const redige = !!p && !p.executif;
    const terminees: TacheTerminee[] = faites
      .filter((t) => t.assigneId === id && t.termineeLe)
      .map((t) => ({ estimationHeures: t.estimationHeures, echeance: t.echeance, termineeLe: dateLocale(t.termineeLe!) }));
    const envoyes = new Set(rapports.filter((x) => x.auteurId === id).map((x) => x.semaine));
    r.set(
      id,
      periodes.map((per, i) => {
        // Aucun rapport attendu avant que l'application ait servi (premier rapport envoyé).
        const attendues = redige && debuts.rapports ? semainesDeRapport(per, jour).filter((l) => l >= debuts.rapports!) : [];
        return mesurer(
          per,
          {
            terminees,
            minutesReunion: reunions[i].get(id) ?? 0,
            capaciteHebdo: caps.get(id) ?? 40,
            rapportsEnvoyes: attendues.filter((l) => envoyes.has(l)).length,
            rapportsAttendus: attendues.length,
          },
          jour,
        );
      }),
    );
  }
  return r;
}
