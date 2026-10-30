/**
 * Absences et congés côté serveur (29 octobre 2026). Qui peut noter ou retirer une absence : la personne
 * elle-même, et ceux qui la suivent (son supérieur, sa direction, les exécutifs). Une personne hors division n'en
 * note pas : la charge ne concerne que la division. Le motif n'est lu que par ces mêmes personnes.
 * La personne absente est prévenue quand un autre note son absence ; son supérieur, quand elle la note elle-même.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { suitPersonne, type Acces } from "@/lib/acces";
import { erreurAbsence, estMotif, LIBELLE_MOTIF, texteAbsence, type MotifAbsence, type Plage } from "@/lib/absences";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, resoudreSuperieur } from "@/lib/regles";

export type Absence = { id: string; personneId: string; debut: string; fin: string; motif: MotifAbsence; creeParId: string | null };

/** Absences de ces personnes qui touchent la période (bornes comprises). */
export async function absencesDe(ids: string[], debut: string, fin: string): Promise<Map<string, Absence[]>> {
  const r = new Map<string, Absence[]>();
  if (!ids.length) return r;
  const lignes = await db
    .select()
    .from(schema.absences)
    .where(and(inArray(schema.absences.personneId, ids), lte(schema.absences.debut, fin), gte(schema.absences.fin, debut)))
    .orderBy(asc(schema.absences.debut));
  for (const l of lignes) {
    const a: Absence = { id: l.id, personneId: l.personneId, debut: l.debut, fin: l.fin, motif: estMotif(l.motif) ? l.motif : "absence", creeParId: l.creeParId };
    (r.get(l.personneId) ?? r.set(l.personneId, []).get(l.personneId)!).push(a);
  }
  return r;
}

/** Les plages seules (pour la charge). */
export const plages = (l: Absence[] | undefined): Plage[] => (l ?? []).map(({ debut, fin }) => ({ debut, fin }));

/** Peut-on noter ou retirer une absence de cette personne ? */
export async function peutGererAbsences(a: Acces, personneId: string): Promise<boolean> {
  if (a.moi.externe) return false;
  const org = await chargerOrganisation();
  const p = org.personnes.get(personneId);
  if (!p || !p.actif || p.externe) return false;
  return personneId === a.moi.id || suitPersonne(a, personneId);
}

/** Absences à venir (et en cours) d'une personne, pour son profil ou sa fiche. */
export async function absencesAVenir(personneId: string): Promise<Absence[]> {
  const jour = aujourdhui();
  return (await absencesDe([personneId], jour, "9999-12-31")).get(personneId) ?? [];
}

export async function noterAbsence(
  a: Acces,
  d: { personneId: string; debut: string; fin: string; motif: string },
): Promise<{ ok: true; id: string; message: string; deja?: boolean } | { erreur: string }> {
  if (!(await peutGererAbsences(a, d.personneId))) return { erreur: a.moi.externe ? "Les absences ne se notent que dans la division." : "Vous ne pouvez noter que vos absences, ou celles des personnes que vous suivez." };
  const plage = { debut: String(d.debut ?? ""), fin: String(d.fin ?? "") || String(d.debut ?? "") };
  const erreur = erreurAbsence(plage, aujourdhui());
  if (erreur) return { erreur };
  const motif: MotifAbsence = estMotif(d.motif) ? d.motif : "conge";
  const org = await chargerOrganisation();
  const p = org.personnes.get(d.personneId)!;
  const pour = d.personneId === a.moi.id ? "vous" : nomComplet(p);
  // Déjà couverte par une absence notée : rien de plus.
  const existantes = (await absencesDe([d.personneId], plage.debut, plage.fin)).get(d.personneId) ?? [];
  const couvrante = existantes.find((x) => x.debut <= plage.debut && x.fin >= plage.fin);
  if (couvrante) return { ok: true, id: couvrante.id, deja: true, message: `Déjà notée : ${LIBELLE_MOTIF[couvrante.motif].toLowerCase()} ${texteAbsence(couvrante)}.` };
  const [l] = await db.insert(schema.absences).values({ personneId: d.personneId, debut: plage.debut, fin: plage.fin, motif, creeParId: a.moi.id }).returning({ id: schema.absences.id });
  await noter(a.moi.id, "absence_notee", l.id, { personneId: d.personneId });
  const texte = texteAbsence(plage);
  const auteur = org.personnes.get(a.moi.id);
  if (d.personneId !== a.moi.id) {
    await db.insert(schema.notifications).values({ personneId: d.personneId, type: "absence", texte: `${auteur ? nomComplet(auteur) : "Votre supérieur"} a noté votre absence ${texte} (${LIBELLE_MOTIF[motif].toLowerCase()}).`, lien: "/profil#absences" });
  } else {
    const sup = resoudreSuperieur(org, a.moi.id);
    if (sup && sup.id !== a.moi.id)
      await db.insert(schema.notifications).values({ personneId: sup.id, type: "absence", texte: `${nomComplet(p)} sera absent(e) ${texte} (${LIBELLE_MOTIF[motif].toLowerCase()}).`, lien: `/personnes/${p.id}#absences` });
  }
  return { ok: true, id: l.id, message: `Absence notée pour ${pour} : ${LIBELLE_MOTIF[motif].toLowerCase()} ${texte}. Elle compte dans la charge.` };
}

export async function retirerAbsence(a: Acces, id: string): Promise<{ ok: true; message: string } | { erreur: string }> {
  if (!/^[0-9a-f-]{36}$/.test(String(id ?? ""))) return { erreur: "Absence introuvable." };
  const [x] = await db.select().from(schema.absences).where(eq(schema.absences.id, id));
  if (!x) return { ok: true, message: "Déjà retirée." };
  if (!(await peutGererAbsences(a, x.personneId))) return { erreur: "Absence introuvable." };
  await db.delete(schema.absences).where(eq(schema.absences.id, id));
  await noter(a.moi.id, "absence_retiree", id, { personneId: x.personneId });
  return { ok: true, message: `Absence ${texteAbsence(x)} retirée.` };
}
