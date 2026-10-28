/**
 * Ce dont la barre (chercher, ajouter une tâche) a besoin : les projets ouverts que la personne voit déjà
 * (« / »), et les personnes à qui elle peut confier une tâche (« @ »), avec les règles d'assignation.
 */
import "server-only";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { assignables } from "@/lib/donnees/gestion";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import type { ProjetSaisie } from "@/lib/saisie-rapide";
import { tachesDe } from "@/lib/donnees/semaine";

export async function projetsPourSaisie(u: Utilisateur): Promise<ProjetSaisie[]> {
  const visibles = await idsProjetsVisibles(await acces(u));
  return (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
}

export async function donneesBarre(u: Utilisateur) {
  const a = await acces(u);
  const [projets, pour, miennes] = await Promise.all([projetsPourSaisie(u), assignables(a), tachesDe([u.id])]);
  // « # » : mes tâches ouvertes, pour les retrouver et les mettre à jour.
  const taches = miennes.filter((t) => t.statut !== "faite").map((t) => ({ id: t.id, titre: t.titre, code: t.projetCode ?? null, echeance: t.echeance ?? null }));
  return { projets, personnes: pour.personnes, base: pour.base, parProjet: pour.parProjet, taches, moiId: u.id, aujourdhui: aujourdhui() };
}
