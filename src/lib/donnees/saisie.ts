/**
 * Ce dont la barre (chercher, ajouter ou mettre à jour une tâche) a besoin : les projets ouverts que la
 * personne voit déjà (« / »), les personnes à qui elle peut confier une tâche (« @ »), avec les règles
 * d'assignation, et les tâches ouvertes qu'elle peut mettre à jour (« # »).
 */
import "server-only";
import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, contactsVisibles, idsProjetsVisibles, peutModifierTache, type Acces } from "@/lib/acces";
import { chargerOrganisation } from "@/lib/organisation";
import { reunionsDe } from "@/lib/donnees/reunions";
import { lundiDe } from "@/lib/dates";
import type { Utilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { assignables } from "@/lib/donnees/gestion";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { donneesCommandes } from "@/lib/donnees/commandes";
import type { ProjetSaisie } from "@/lib/saisie-rapide";
import type { TacheBarre } from "@/components/BarreCommande";
import { nomComplet } from "@/lib/regles";

export async function projetsPourSaisie(u: Utilisateur): Promise<ProjetSaisie[]> {
  const visibles = await idsProjetsVisibles(await acces(u));
  return (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
}

/**
 * « # » : les tâches ouvertes qu'on peut mettre à jour ou confier à quelqu'un d'autre : les miennes, celles de
 * mon équipe directe, celles que j'ai confiées, celles des projets que je dirige. Les miennes d'abord.
 */
export async function tachesPourBarre(a: Acces): Promise<TacheBarre[]> {
  const conditions: SQL[] = [inArray(schema.taches.assigneId, [a.moi.id, ...a.equipeDirecte]), eq(schema.taches.creeParId, a.moi.id)];
  if (a.projetsDiriges.size) conditions.push(inArray(schema.taches.projetId, [...a.projetsDiriges]));
  const lignes = await db
    .select({
      id: schema.taches.id,
      titre: schema.taches.titre,
      statut: schema.taches.statut,
      echeance: schema.taches.echeance,
      projetId: schema.taches.projetId,
      assigneId: schema.taches.assigneId,
      creeParId: schema.taches.creeParId,
      code: schema.projets.code,
      prenom: schema.personnes.prenom,
      nom: schema.personnes.nom,
    })
    .from(schema.taches)
    .innerJoin(schema.personnes, eq(schema.personnes.id, schema.taches.assigneId))
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(isNull(schema.taches.annuleeLe), ne(schema.taches.statut, "faite"), or(...conditions)))
    .orderBy(sql`${schema.taches.assigneId} = ${a.moi.id} desc`, asc(schema.taches.echeance), asc(schema.taches.titre))
    .limit(300);
  return lignes
    .filter((t) => peutModifierTache(a, t))
    .map((t) => ({ id: t.id, titre: t.titre, code: t.code ?? null, echeance: t.echeance ?? null, projetId: t.projetId, statut: t.statut, pour: t.assigneId === a.moi.id ? null : nomComplet(t) }));
}

/**
 * « Réunion … » puis « @ » : les personnes qu'on peut inviter (comme sur la page Réunions) : toute personne
 * active ; hors division (accès limité), seulement celles avec qui l'on travaille déjà.
 */
export async function participantsPourBarre(a: Acces) {
  const org = await chargerOrganisation();
  const contacts = a.moi.externe ? await contactsVisibles(a) : null;
  return [...org.personnes.values()]
    .filter((p) => p.actif && p.id !== a.moi.id && (!contacts || contacts.has(p.id)))
    .sort((x, y) => Number(x.externe) - Number(y.externe) || x.nom.localeCompare(y.nom, "fr"))
    .map((p) => ({ id: p.id, nom: nomComplet(p), externe: p.externe, organisation: p.externe ? p.organisation : p.poste }));
}

export async function donneesBarre(u: Utilisateur) {
  const a = await acces(u);
  const jour = aujourdhui();
  const [projets, pour, taches, participants, reunions, commandes] = await Promise.all([projetsPourSaisie(u), assignables(a), tachesPourBarre(a), participantsPourBarre(a), reunionsDe(u.id, jour, jour), donneesCommandes(u, a)]);
  // Suggestions de la barre vide : les réunions du jour (pour les compléter).
  const reunionsDuJour = reunions.map((r) => ({ id: r.id, titre: r.titre, heure: r.heure, semaine: lundiDe(r.jour), mienne: r.noteeParId === u.id }));
  return { projets, personnes: pour.personnes, base: pour.base, parProjet: pour.parProjet, taches, participants, reunionsDuJour, moiId: u.id, aujourdhui: jour, ...commandes };
}
