/**
 * « Ajouter à mon agenda » côté serveur : les réunions d'une personne en fichier iCalendar (src/lib/agenda.ts).
 * Seulement les réunions dont elle est participante (ou qu'elle a notées) ; pour une série, celles à venir.
 */
import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fichierAgenda, type EvenementAgenda } from "@/lib/agenda";
import { aujourdhui } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

export async function agendaDeReunion(personneId: string, reunionId: string, serie: boolean): Promise<{ fichier: string; nom: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(reunionId)) return null;
  const [r] = await db.select().from(schema.reunions).where(eq(schema.reunions.id, reunionId));
  if (!r) return null;
  const ids = serie && r.serieId ? (await db.select({ id: schema.reunions.id }).from(schema.reunions).where(and(eq(schema.reunions.serieId, r.serieId), gte(schema.reunions.jour, aujourdhui())))).map((x) => x.id) : [r.id];
  if (!ids.length) ids.push(r.id);
  const [lignes, participants] = await Promise.all([
    db
      .select({ r: schema.reunions, code: schema.projets.code, projetTitre: schema.projets.titre })
      .from(schema.reunions)
      .leftJoin(schema.projets, eq(schema.projets.id, schema.reunions.projetId))
      .where(inArray(schema.reunions.id, ids))
      .orderBy(asc(schema.reunions.jour), asc(schema.reunions.heure)),
    db.select().from(schema.participantsReunion).where(inArray(schema.participantsReunion.reunionId, ids)),
  ]);
  const org = await chargerOrganisation();
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const evenements: EvenementAgenda[] = [];
  for (const { r: x, code, projetTitre } of lignes) {
    const avec = participants.filter((p) => p.reunionId === x.id).map((p) => p.personneId);
    // Seulement les réunions de la personne : participante, ou qui l'a notée.
    if (!avec.includes(personneId) && x.noteeParId !== personneId) continue;
    const noms = avec
      .map((id) => org.personnes.get(id))
      .filter((p) => !!p)
      .map((p) => nomComplet(p!))
      .sort((a, b) => a.localeCompare(b, "fr"));
    const description = [code ? `Projet ${code} · ${projetTitre ?? ""}`.trim() : null, noms.length ? `Avec : ${noms.join(", ")}` : null, "Notée dans Pilotage des projets."].filter(Boolean).join("\n");
    evenements.push({
      uid: `${x.id}@pilotage-dpo`,
      titre: code ? `${code} · ${x.titre}` : x.titre,
      jour: x.jour,
      heure: x.heure,
      dureeMinutes: x.dureeMinutes,
      description,
      url: base ? `${base}/reunions?semaine=${x.jour}` : undefined,
    });
  }
  if (!evenements.length) return null;
  return { fichier: fichierAgenda(evenements, { maintenant: new Date(), tz: TZ }), nom: `reunion-${r.jour}${evenements.length > 1 ? "-serie" : ""}.ics` };
}
