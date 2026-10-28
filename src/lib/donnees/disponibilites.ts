/**
 * Avant de noter une réunion : qui est déjà pris à cette heure ? On ne connaît que les réunions notées dans
 * l'application. Le titre d'une réunion n'est montré qu'à qui y participe aussi (sinon « pris de … à … »).
 */
import "server-only";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { chevauche, minutesDe, type Disponibilite } from "@/lib/creneaux";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function disponibilites(o: { moiId: string; personneIds: string[]; jour: string; heure: string; duree: number; sauf?: string | null }): Promise<Disponibilite[]> {
  if (!JOUR.test(o.jour) || !HEURE.test(o.heure) || !(o.duree >= 5 && o.duree <= 600)) return [];
  const ids = [...new Set([o.moiId, ...o.personneIds])].slice(0, 60);
  const conditions = [eq(schema.reunions.jour, o.jour), isNotNull(schema.reunions.heure), inArray(schema.participantsReunion.personneId, ids)];
  if (o.sauf && /^[0-9a-f-]{36}$/.test(o.sauf)) conditions.push(ne(schema.reunions.id, o.sauf));
  const lignes = await db
    .select({ reunionId: schema.reunions.id, titre: schema.reunions.titre, heure: schema.reunions.heure, duree: schema.reunions.dureeMinutes, personneId: schema.participantsReunion.personneId })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(...conditions));
  const miennes = new Set(lignes.filter((l) => l.personneId === o.moiId).map((l) => l.reunionId));
  const org = await chargerOrganisation();
  const parPersonne = new Map<string, Disponibilite>();
  for (const l of lignes) {
    if (!chevauche({ heure: o.heure, duree: o.duree }, { heure: l.heure!, duree: l.duree })) continue;
    const p = org.personnes.get(l.personneId);
    const d = parPersonne.get(l.personneId) ?? { id: l.personneId, nom: p ? nomComplet(p) : "—", moi: l.personneId === o.moiId, occupe: [] };
    const debut = minutesDe(l.heure!);
    d.occupe.push({ debut, fin: debut + l.duree, titre: miennes.has(l.reunionId) ? l.titre : null });
    parPersonne.set(l.personneId, d);
  }
  // Moi d'abord, puis les autres dans l'ordre demandé.
  return ids.map((id) => parPersonne.get(id)).filter((d): d is Disponibilite => !!d).map((d) => ({ ...d, occupe: d.occupe.sort((x, y) => x.debut - y.debut) }));
}
