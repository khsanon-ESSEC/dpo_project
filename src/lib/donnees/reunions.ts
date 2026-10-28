/**
 * Journal des réunions. Une réunion est notée une fois, par l'une des personnes présentes, avec les
 * autres participants : elle compte pour chacun (semaine, rapport du vendredi, charge, bilan).
 * Celui qui l'a notée la modifie ou la supprime ; un participant peut s'en retirer.
 */
import "server-only";
import { disponibilites } from "@/lib/donnees/disponibilites";
import type { Disponibilite } from "@/lib/creneaux";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { ajouterJours, dateCourte } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { dureeTexte, dureeValide } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import type { ReunionsFigees } from "@/lib/modeles";

export type SaisieReunion = { titre: string; jour: string; heure: string; dureeMinutes: unknown; projetId: string; notes: string; participants: string[] };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Réunions d'une personne (notées par elle ou par un autre participant) entre deux dates incluses. */
export async function reunionsDe(personneId: string, debut: string, fin: string) {
  const miennes = await db
    .select({ id: schema.participantsReunion.reunionId })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(eq(schema.participantsReunion.personneId, personneId), gte(schema.reunions.jour, debut), lte(schema.reunions.jour, fin)));
  return detailler(miennes.map((m) => m.id));
}

async function detailler(ids: string[]) {
  if (!ids.length) return [];
  const org = await chargerOrganisation();
  const [lignes, participants, actions] = await Promise.all([
    db
      .select({ r: schema.reunions, code: schema.projets.code, projetTitre: schema.projets.titre })
      .from(schema.reunions)
      .leftJoin(schema.projets, eq(schema.projets.id, schema.reunions.projetId))
      .where(inArray(schema.reunions.id, ids))
      .orderBy(asc(schema.reunions.jour), asc(schema.reunions.heure)),
    db.select().from(schema.participantsReunion).where(inArray(schema.participantsReunion.reunionId, ids)),
    // Actions décidées en réunion : les tâches qui en viennent (sans les annulées).
    db
      .select({ id: schema.taches.id, reunionId: schema.taches.reunionId, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, assigneId: schema.taches.assigneId, projetId: schema.taches.projetId, creeParId: schema.taches.creeParId })
      .from(schema.taches)
      .where(and(inArray(schema.taches.reunionId, ids), isNull(schema.taches.annuleeLe)))
      .orderBy(asc(schema.taches.creeLe)),
  ]);
  return lignes.map(({ r, code, projetTitre }) => {
    const avec = participants.filter((p) => p.reunionId === r.id).map((p) => p.personneId);
    const notee = r.noteeParId ? org.personnes.get(r.noteeParId) : undefined;
    return {
      ...r,
      projetCode: code,
      projetTitre,
      participants: avec
        .map((id) => org.personnes.get(id))
        .filter((p) => !!p)
        .map((p) => ({ id: p!.id, nom: nomComplet(p!), prenom: p!.prenom }))
        .sort((x, y) => x.nom.localeCompare(y.nom, "fr")),
      noteePar: notee ? { id: notee.id, nom: nomComplet(notee) } : null,
      actions: actions
        .filter((t) => t.reunionId === r.id)
        .map((t) => {
          const p = org.personnes.get(t.assigneId);
          return { ...t, pour: p ? nomComplet(p) : "", prenom: p?.prenom ?? "" };
        }),
    };
  });
}
export type ReunionDetaillee = Awaited<ReturnType<typeof reunionsDe>>[number];

/** Minutes de réunion par personne entre deux dates incluses. */
export async function minutesDeReunion(personneIds: string[], debut: string, fin: string): Promise<Map<string, number>> {
  const m = new Map<string, number>(personneIds.map((id) => [id, 0]));
  if (!personneIds.length) return m;
  const lignes = await db
    .select({ personneId: schema.participantsReunion.personneId, minutes: schema.reunions.dureeMinutes })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(inArray(schema.participantsReunion.personneId, personneIds), gte(schema.reunions.jour, debut), lte(schema.reunions.jour, fin)));
  for (const l of lignes) m.set(l.personneId, (m.get(l.personneId) ?? 0) + l.minutes);
  return m;
}

/** Heures de réunion par personne et par jour, à partir d'une date (pour la charge). */
export async function reunionsParJour(personneIds: string[], depuis: string, jusqua: string): Promise<Map<string, { jour: string; heures: number }[]>> {
  const m = new Map<string, { jour: string; heures: number }[]>(personneIds.map((id) => [id, []]));
  if (!personneIds.length) return m;
  const lignes = await db
    .select({ personneId: schema.participantsReunion.personneId, jour: schema.reunions.jour, minutes: schema.reunions.dureeMinutes })
    .from(schema.participantsReunion)
    .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
    .where(and(inArray(schema.participantsReunion.personneId, personneIds), gte(schema.reunions.jour, depuis), lte(schema.reunions.jour, jusqua)));
  for (const l of lignes) m.get(l.personneId)?.push({ jour: l.jour, heures: l.minutes / 60 });
  return m;
}

/** Parmi ces personnes, celles qui peuvent lire une alerte : la division, et les personnes hors division qui ont un accès. */
async function prevenables(ids: string[]) {
  if (!ids.length) return [];
  const lignes = await db
    .select({ id: schema.personnes.id, externe: schema.personnes.externe, hash: schema.personnes.motDePasseHash })
    .from(schema.personnes)
    .where(inArray(schema.personnes.id, ids));
  return lignes.filter((p) => !p.externe || p.hash).map((p) => p.id);
}

/** Contrôle d'une saisie : renvoie les valeurs propres ou un message. */
async function verifier(d: SaisieReunion, moiId: string) {
  const titre = String(d.titre ?? "").trim().slice(0, 160);
  if (!titre) return { erreur: "Donnez un titre à la réunion." } as const;
  if (!JOUR.test(d.jour)) return { erreur: "Choisissez le jour de la réunion." } as const;
  const duree = dureeValide(d.dureeMinutes);
  if (!duree) return { erreur: "Une réunion dure de 5 minutes à 10 heures." } as const;
  const heure = HEURE.test(d.heure) ? d.heure : null;
  // Lu en base : des personnes hors division peuvent avoir été ajoutées dans cette même requête.
  const demandes = [...new Set(d.participants.filter((id) => /^[0-9a-f-]{36}$/.test(id)))];
  const actifs = demandes.length
    ? (await db.select({ id: schema.personnes.id }).from(schema.personnes).where(and(inArray(schema.personnes.id, demandes), eq(schema.personnes.actif, true)))).map((p) => p.id)
    : [];
  const participants = [...new Set([moiId, ...actifs])];
  const projetId = /^[0-9a-f-]{36}$/.test(d.projetId) ? d.projetId : null;
  return { titre, jour: d.jour, heure, dureeMinutes: duree, projetId, notes: String(d.notes ?? "").trim().slice(0, 2000), participants } as const;
}

/** Noter une réunion : la personne qui la note y participe ; les autres participants sont prévenus. */
export async function noterReunion(a: Acces, d: SaisieReunion, projetsPermis: Set<string> | "tous"): Promise<{ id: string; occupes: Disponibilite[] } | { erreur: string }> {
  const v = await verifier(d, a.moi.id);
  if ("erreur" in v) return { erreur: v.erreur! };
  if (v.projetId && projetsPermis !== "tous" && !projetsPermis.has(v.projetId)) return { erreur: "Projet introuvable." };
  const [r] = await db
    .insert(schema.reunions)
    .values({ titre: v.titre, jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes, projetId: v.projetId, notes: v.notes, noteeParId: a.moi.id })
    .returning({ id: schema.reunions.id });
  await db.insert(schema.participantsReunion).values(v.participants.map((personneId) => ({ reunionId: r.id, personneId })));
  // Qui était déjà pris à cette heure (autres réunions notées) : la personne qui note est avertie, la personne prise aussi.
  const occupes = v.heure ? await disponibilites({ moiId: a.moi.id, personneIds: v.participants, jour: v.jour, heure: v.heure, duree: v.dureeMinutes, sauf: r.id }) : [];
  const prise = new Set(occupes.map((o) => o.id));
  const autres = await prevenables(v.participants.filter((id) => id !== a.moi.id));
  if (autres.length)
    await db.insert(schema.notifications).values(
      autres.map((personneId) => ({
        personneId,
        type: "reunion",
        texte: `${a.moi.prenom} ${a.moi.nom} a noté « ${v.titre} » (${dateCourte(v.jour)}${v.heure ? ` à ${v.heure.replace(":", " h ").replace(" h 00", " h")}` : ""}, ${dureeTexte(v.dureeMinutes)}) avec vous${prise.has(personneId) ? " ; attention, vous êtes déjà pris(e) à cette heure" : " : inutile de la noter à nouveau"}`,
        lien: `/reunions?semaine=${v.jour}`,
      })),
    );
  await noter(a.moi.id, "reunion_notee", r.id, { titre: v.titre, jour: v.jour, minutes: v.dureeMinutes, participants: v.participants.length });
  return { id: r.id, occupes };
}

async function reunionNoteePar(id: string, moiId: string) {
  const [r] = await db.select().from(schema.reunions).where(eq(schema.reunions.id, id));
  return r && r.noteeParId === moiId ? r : null;
}

export async function modifierReunion(a: Acces, id: string, d: SaisieReunion, projetsPermis: Set<string> | "tous"): Promise<{ ok: true; occupes: Disponibilite[] } | { erreur: string }> {
  const r = await reunionNoteePar(id, a.moi.id);
  if (!r) return { erreur: "Seule la personne qui a noté la réunion la modifie." };
  const v = await verifier(d, a.moi.id);
  if ("erreur" in v) return { erreur: v.erreur! };
  if (v.projetId && v.projetId !== r.projetId && projetsPermis !== "tous" && !projetsPermis.has(v.projetId)) return { erreur: "Projet introuvable." };
  await db.update(schema.reunions).set({ titre: v.titre, jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes, projetId: v.projetId, notes: v.notes }).where(eq(schema.reunions.id, id));
  const avant = new Set((await db.select().from(schema.participantsReunion).where(eq(schema.participantsReunion.reunionId, id))).map((p) => p.personneId));
  await db.delete(schema.participantsReunion).where(eq(schema.participantsReunion.reunionId, id));
  await db.insert(schema.participantsReunion).values(v.participants.map((personneId) => ({ reunionId: id, personneId })));
  const occupes = v.heure ? await disponibilites({ moiId: a.moi.id, personneIds: v.participants, jour: v.jour, heure: v.heure, duree: v.dureeMinutes, sauf: id }) : [];
  const prise = new Set(occupes.map((o) => o.id));
  const nouveaux = await prevenables(v.participants.filter((p) => !avant.has(p) && p !== a.moi.id));
  if (nouveaux.length)
    await db.insert(schema.notifications).values(
      nouveaux.map((personneId) => ({
        personneId,
        type: "reunion",
        texte: `${a.moi.prenom} ${a.moi.nom} a noté « ${v.titre} » (${dateCourte(v.jour)}, ${dureeTexte(v.dureeMinutes)}) avec vous${prise.has(personneId) ? " ; attention, vous êtes déjà pris(e) à cette heure" : ""}`,
        lien: `/reunions?semaine=${v.jour}`,
      })),
    );
  await noter(a.moi.id, "reunion_modifiee", id, { titre: v.titre, jour: v.jour, minutes: v.dureeMinutes });
  return { ok: true, occupes };
}

export async function supprimerReunion(a: Acces, id: string): Promise<{ ok: true } | { erreur: string }> {
  const r = await reunionNoteePar(id, a.moi.id);
  if (!r) return { erreur: "Seule la personne qui a noté la réunion la supprime." };
  await db.delete(schema.reunions).where(eq(schema.reunions.id, id));
  await noter(a.moi.id, "reunion_supprimee", id, { titre: r.titre, jour: r.jour });
  return { ok: true };
}

/** Un participant ajouté par erreur se retire (la personne qui l'a notée, elle, la supprime). */
export async function quitterReunion(a: Acces, id: string): Promise<{ ok: true } | { erreur: string }> {
  const [r] = await db.select().from(schema.reunions).where(eq(schema.reunions.id, id));
  if (!r) return { erreur: "Réunion introuvable." };
  if (r.noteeParId === a.moi.id) return { erreur: "Vous avez noté cette réunion : supprimez-la plutôt." };
  await db.delete(schema.participantsReunion).where(and(eq(schema.participantsReunion.reunionId, id), eq(schema.participantsReunion.personneId, a.moi.id)));
  await noter(a.moi.id, "reunion_quittee", id);
  return { ok: true };
}

/** Ce que le champ « reunions » montre et fige : les réunions de la semaine de la personne. */
export async function reunionsDeLaSemaine(personneId: string, lundi: string): Promise<ReunionsFigees> {
  const liste = await reunionsDe(personneId, lundi, ajouterJours(lundi, 6));
  return {
    minutes: liste.reduce((s, r) => s + r.dureeMinutes, 0),
    reunions: liste.map((r) => ({ titre: r.titre, jour: r.jour, heure: r.heure, minutes: r.dureeMinutes, projet: r.projetCode, avec: r.participants.length - 1 })),
  };
}
