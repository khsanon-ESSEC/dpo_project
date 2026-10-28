/**
 * « Annuler » juste après une action faite depuis la barre. Ce qu'il faut pour la défaire est gardé ici,
 * côté serveur, trois minutes ; la page n'a qu'un identifiant. On ne défait que sa propre action, une seule
 * fois, et seulement si rien n'a changé depuis (sinon : « annulez depuis la fiche »).
 */
import "server-only";
import { and, eq, gte, inArray, isNull, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { peutModifierTache } from "@/lib/acces";
import { histoireDeTache, retirerIndicateur, supprimerTache } from "@/lib/donnees/gestion";
import { supprimerReunion } from "@/lib/donnees/reunions";
import { noter } from "@/lib/journal";
import { peutGererProjet } from "@/lib/projets";

export const DUREE_ANNULATION_MINUTES = 3;

type StatutTache = "a_faire" | "en_cours" | "bloquee" | "faite";
type Sante = "dans_les_temps" | "a_surveiller" | "en_retard";

export type Annulable =
  | { genre: "tache_creee"; tacheId: string; depuis: string }
  | {
      genre: "tache_maj";
      tacheId: string;
      depuis: string;
      apresMajLe: string;
      avant: { statut: StatutTache; blocage: string | null; termineeLe: string | null; echeance: string | null; estimationHeures: number | null; assigneId: string; projetId: string | null };
    }
  | { genre: "relance"; tacheId: string; evenementId: string; notificationId: string }
  | { genre: "reunion"; reunionId: string; titre: string; participants: string[]; depuis: string; etat?: string }
  | { genre: "note_ligne"; ligneId: string }
  | { genre: "note_reponse"; rapportId: string; champId: string; avant: string | null; apres?: string }
  | { genre: "projet"; projetId: string; apresMajLe: string; avant: { sante: Sante; santeMotif: string; santeLe: string | null; dateFinPrevue: string | null; dateLancementPrevue: string | null } }
  | { genre: "jalon"; projetId: string; indicateurId: string };

export async function enregistrerAnnulation(personneId: string, a: Annulable): Promise<string> {
  const { genre, ...donnees } = a;
  const [r] = await db.insert(schema.annulations).values({ personneId, genre, donnees }).returning({ id: schema.annulations.id });
  // Ménage : les jetons de plus d'un jour ne servent plus.
  await db.delete(schema.annulations).where(sql`${schema.annulations.creeLe} < now() - interval '1 day'`);
  return r.id;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Ce qu'on compare pour savoir si une réunion a changé depuis qu'elle a été notée. */
export const etatReunion = (r: { titre: string; jour: string; heure: string | null; dureeMinutes: number; projetId: string | null; notes: string }) =>
  JSON.stringify([r.titre, r.jour, r.heure ?? "", r.dureeMinutes, r.projetId ?? "", r.notes]);

/** Les alertes que l'action a créées : celles qui portent le nom de la personne qui a agi, sur cette tâche, depuis. */
const alertesDeLAction = (a: Acces, tacheId: string, depuis: Date) =>
  and(eq(schema.notifications.lien, `/taches/${tacheId}`), gte(schema.notifications.creeLe, depuis), like(schema.notifications.texte, `${`${a.moi.prenom} ${a.moi.nom}`.replace(/[%_\\]/g, "\\$&")}%`));

/**
 * Confier une tâche fait entrer la personne dans l'équipe du projet. Si l'action est annulée, elle en ressort,
 * à condition que ce soit bien cette action qui l'y avait fait entrer et que plus rien ne l'y retienne
 * (une autre tâche sur le projet, un rôle de chef ou de référent).
 */
async function sortirDeLEquipeSiAjoutee(projetId: string | null, personneId: string, parId: string, depuis: Date) {
  if (!projetId) return;
  const [m] = await db
    .select()
    .from(schema.membresProjet)
    .where(and(eq(schema.membresProjet.projetId, projetId), eq(schema.membresProjet.personneId, personneId)));
  if (!m || m.ajouteParId !== parId || m.ajouteLe.getTime() < depuis.getTime() - 2000) return;
  const [p] = await db.select({ chef: schema.projets.chefProjetId, referent: schema.projets.referentId }).from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p || p.chef === personneId || p.referent === personneId) return;
  const [autre] = await db
    .select({ id: schema.taches.id })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), eq(schema.taches.assigneId, personneId), isNull(schema.taches.annuleeLe)))
    .limit(1);
  if (autre) return;
  await db.delete(schema.membresProjet).where(eq(schema.membresProjet.id, m.id));
}

export async function annulerAction(a: Acces, id: string): Promise<{ ok: true; message: string } | { erreur: string }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erreur: "Rien à annuler." };
  // Réservé, une seule fois, à la personne qui a fait l'action, dans les trois minutes.
  const [jeton] = await db
    .update(schema.annulations)
    .set({ utiliseeLe: new Date() })
    .where(
      and(
        eq(schema.annulations.id, id),
        eq(schema.annulations.personneId, a.moi.id),
        isNull(schema.annulations.utiliseeLe),
        sql`${schema.annulations.creeLe} > now() - make_interval(mins => ${DUREE_ANNULATION_MINUTES})`,
      ),
    )
    .returning();
  if (!jeton) return { erreur: "Trop tard pour annuler ici : faites-le depuis la fiche." };
  const d = { genre: jeton.genre, ...jeton.donnees } as Annulable;
  const r = await defaire(a, d);
  if ("erreur" in r) {
    // L'annulation n'a pas pu se faire : le jeton redevient utilisable (rien n'a été touché).
    await db.update(schema.annulations).set({ utiliseeLe: null }).where(eq(schema.annulations.id, id));
    return r;
  }
  await noter(a.moi.id, "action_annulee", null, { genre: d.genre });
  return r;
}

async function defaire(a: Acces, d: Annulable): Promise<{ ok: true; message: string } | { erreur: string }> {
  switch (d.genre) {
    case "tache_creee": {
      const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, d.tacheId));
      if (!t) return { ok: true, message: "Déjà supprimée." };
      if (!peutModifierTache(a, t)) return { erreur: "Tâche introuvable." };
      const h = await histoireDeTache(t.id);
      if (h.evenements.some((e) => e !== "creation") || h.lignesRapport > 0 || t.statut === "faite") return { erreur: "La tâche a déjà changé : annulez-la depuis sa fiche." };
      const r = await supprimerTache(a, t);
      if ("erreur" in r) return r;
      await db.delete(schema.notifications).where(alertesDeLAction(a, t.id, new Date(d.depuis)));
      await sortirDeLEquipeSiAjoutee(t.projetId, t.assigneId, a.moi.id, new Date(d.depuis));
      return { ok: true, message: `« ${t.titre} » est retirée.` };
    }
    case "tache_maj": {
      const [t] = await db.select().from(schema.taches).where(eq(schema.taches.id, d.tacheId));
      if (!t || !peutModifierTache(a, t)) return { erreur: "Tâche introuvable." };
      if (iso(t.majLe) !== d.apresMajLe) return { erreur: "La tâche a changé depuis : corrigez-la depuis sa fiche." };
      const v = d.avant;
      await db
        .update(schema.taches)
        .set({
          statut: v.statut,
          blocage: v.blocage,
          termineeLe: v.termineeLe ? new Date(v.termineeLe) : null,
          echeance: v.echeance,
          estimationHeures: v.estimationHeures,
          assigneId: v.assigneId,
          projetId: v.projetId,
          majLe: new Date(),
        })
        .where(eq(schema.taches.id, t.id));
      const depuis = new Date(d.depuis);
      await db.delete(schema.evenementsTache).where(and(eq(schema.evenementsTache.tacheId, t.id), eq(schema.evenementsTache.auteurId, a.moi.id), gte(schema.evenementsTache.creeLe, depuis)));
      await db.delete(schema.notifications).where(alertesDeLAction(a, t.id, depuis));
      // L'ancienne personne avait été prévenue que la tâche partait (alerte sans lien).
      if (v.assigneId !== t.assigneId)
        await db.delete(schema.notifications).where(and(eq(schema.notifications.personneId, v.assigneId), like(schema.notifications.texte, `« ${t.titre.replace(/[%_\\]/g, "\\$&")} » est maintenant confiée%`), gte(schema.notifications.creeLe, depuis)));
      if (v.assigneId !== t.assigneId || v.projetId !== t.projetId) await sortirDeLEquipeSiAjoutee(t.projetId, t.assigneId, a.moi.id, depuis);
      return { ok: true, message: `« ${t.titre} » est revenue comme avant.` };
    }
    case "relance": {
      // La trace reste (« relance annulée ») : elle compte encore dans la limite d'une relance par heure.
      await db
        .update(schema.evenementsTache)
        .set({ type: "relance_annulee" })
        .where(and(eq(schema.evenementsTache.id, d.evenementId), eq(schema.evenementsTache.auteurId, a.moi.id)));
      await db.delete(schema.notifications).where(eq(schema.notifications.id, d.notificationId));
      return { ok: true, message: "Relance retirée." };
    }
    case "reunion": {
      const [actuelle] = await db.select().from(schema.reunions).where(eq(schema.reunions.id, d.reunionId));
      if (!actuelle) return { ok: true, message: "Déjà retirée." };
      if (!d.etat || etatReunion(actuelle) !== d.etat) return { erreur: "La réunion a changé depuis : supprimez-la depuis la page Réunions." };
      const [action] = await db.select({ id: schema.taches.id }).from(schema.taches).where(and(eq(schema.taches.reunionId, d.reunionId), isNull(schema.taches.annuleeLe))).limit(1);
      if (action) return { erreur: "Des actions ont été notées pour cette réunion : supprimez-la depuis la page Réunions." };
      const r = await supprimerReunion(a, d.reunionId);
      if ("erreur" in r) return r;
      if (d.participants.length)
        await db
          .delete(schema.notifications)
          .where(
            and(
              inArray(schema.notifications.personneId, d.participants),
              eq(schema.notifications.type, "reunion"),
              like(schema.notifications.texte, `%« ${d.titre.replace(/[%_\\]/g, "\\$&")} »%`),
              gte(schema.notifications.creeLe, new Date(d.depuis)),
            ),
          );
      return { ok: true, message: `Réunion « ${d.titre} » retirée.` };
    }
    case "note_ligne": {
      const [l] = await db
        .select({ id: schema.lignesRapport.id, statut: schema.rapportsHebdo.statut, auteurId: schema.rapportsHebdo.auteurId })
        .from(schema.lignesRapport)
        .innerJoin(schema.rapportsHebdo, eq(schema.rapportsHebdo.id, schema.lignesRapport.rapportId))
        .where(eq(schema.lignesRapport.id, d.ligneId));
      if (!l) return { ok: true, message: "Déjà retirée." };
      if (l.auteurId !== a.moi.id) return { erreur: "Rien à annuler." };
      if (l.statut !== "brouillon") return { erreur: "Le rapport est parti : il ne se modifie plus." };
      await db.delete(schema.lignesRapport).where(eq(schema.lignesRapport.id, l.id));
      return { ok: true, message: "Retirée du rapport." };
    }
    case "note_reponse": {
      const [r] = await db.select().from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.id, d.rapportId));
      if (!r || r.auteurId !== a.moi.id) return { erreur: "Rien à annuler." };
      if (r.statut !== "brouillon") return { erreur: "Le rapport est parti : il ne se modifie plus." };
      const cible = and(eq(schema.reponsesRapport.rapportId, r.id), eq(schema.reponsesRapport.champId, d.champId), isNull(schema.reponsesRapport.projetId));
      const [actuelle] = await db.select({ valeur: schema.reponsesRapport.valeur }).from(schema.reponsesRapport).where(cible);
      if (d.apres === undefined || actuelle?.valeur !== d.apres) return { erreur: "Ce champ a changé depuis : corrigez-le dans le rapport." };
      if (d.avant === null) await db.delete(schema.reponsesRapport).where(cible);
      else await db.update(schema.reponsesRapport).set({ valeur: d.avant, majLe: new Date() }).where(cible);
      return { ok: true, message: "Retirée du rapport." };
    }
    case "projet": {
      const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, d.projetId));
      if (!p || !peutGererProjet({ moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) return { erreur: "Projet introuvable." };
      if (iso(p.majLe) !== d.apresMajLe) return { erreur: "Le projet a changé depuis : corrigez-le depuis sa fiche." };
      const v = d.avant;
      await db
        .update(schema.projets)
        .set({ sante: v.sante, santeMotif: v.santeMotif, santeLe: v.santeLe ? new Date(v.santeLe) : null, dateFinPrevue: v.dateFinPrevue, dateLancementPrevue: v.dateLancementPrevue, majLe: new Date() })
        .where(eq(schema.projets.id, p.id));
      return { ok: true, message: `« ${p.titre} » est revenu comme avant.` };
    }
    case "jalon": {
      const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, d.projetId));
      if (!p || !peutGererProjet({ moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) return { erreur: "Projet introuvable." };
      const [i] = await db.select({ etat: schema.indicateurs.etat }).from(schema.indicateurs).where(and(eq(schema.indicateurs.id, d.indicateurId), eq(schema.indicateurs.projetId, p.id)));
      if (!i) return { ok: true, message: "Déjà retiré." };
      if (i.etat !== "a_venir") return { erreur: "Le jalon a changé depuis : retirez-le depuis la fiche du projet." };
      await retirerIndicateur(p.id, d.indicateurId, a.moi.id);
      return { ok: true, message: "Jalon retiré." };
    }
  }
}
