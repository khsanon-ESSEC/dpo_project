/**
 * Ce dont la barre (chercher, ajouter ou mettre à jour une tâche) a besoin : les projets ouverts que la
 * personne voit déjà (« / »), les personnes à qui elle peut confier une tâche (« @ »), avec les règles
 * d'assignation, et les tâches ouvertes qu'elle peut mettre à jour (« # »).
 */
import "server-only";
import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, idsProjetsVisibles, peutModifierTache, type Acces } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { assignables } from "@/lib/donnees/gestion";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
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

export async function donneesBarre(u: Utilisateur) {
  const a = await acces(u);
  const [projets, pour, taches] = await Promise.all([projetsPourSaisie(u), assignables(a), tachesPourBarre(a)]);
  return { projets, personnes: pour.personnes, base: pour.base, parProjet: pour.parProjet, taches, moiId: u.id, aujourdhui: aujourdhui() };
}
