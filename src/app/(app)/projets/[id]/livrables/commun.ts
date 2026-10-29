import "server-only";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { membresDuProjet } from "@/lib/donnees/gestion";
import { phasesDuProjet } from "@/lib/donnees/risques";
import { chargerOrganisation } from "@/lib/organisation";
import { peutGererProjet } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { phaseEnCours } from "@/lib/risques";

/**
 * Pages des livrables d'un projet (la liste à gérer, et « Nouveau livrable ») : ce qu'il leur faut, pour qui gère
 * le projet (chef, référent, sa direction, les exécutifs). Les autres n'y entrent pas : ils voient les livrables
 * sur la fiche du projet et sur la page de chaque livrable.
 */
export async function donneesLivrables(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, id);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) notFound();
  const [indicateurs, org, membres, tachesLiees, phases] = await Promise.all([
    db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, id)).orderBy(asc(schema.indicateurs.ordre)),
    chargerOrganisation(),
    membresDuProjet(id),
    db.select({ livrableId: schema.taches.livrableId }).from(schema.taches).where(and(eq(schema.taches.projetId, id), isNull(schema.taches.annuleeLe))),
    phasesDuProjet(id),
  ]);
  const nTaches = new Map<string, number>();
  for (const t of tachesLiees) if (t.livrableId) nTaches.set(t.livrableId, (nTaches.get(t.livrableId) ?? 0) + 1);
  const personnes = [...org.personnes.values()]
    .filter((x) => x.actif || x.id === p.chefProjetId || x.id === p.referentId)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((x) => ({ id: x.id, nom: nomComplet(x), externe: x.externe, organisation: x.organisation, poste: x.poste }));
  // Responsable d'un livrable : l'équipe du projet d'abord, puis les autres personnes actives.
  const equipe = new Set([p.chefProjetId, p.referentId, ...membres.map((m) => m.personneId)].filter((x): x is string => !!x));
  const optionsResponsable = [
    ...personnes.filter((x) => equipe.has(x.id)).map((x) => ({ value: x.id, label: x.nom, detail: x.poste || x.organisation || undefined, groupe: "Équipe du projet" })),
    ...personnes.filter((x) => !equipe.has(x.id) && !x.externe).map((x) => ({ value: x.id, label: x.nom, detail: x.poste || undefined, groupe: "Division" })),
    ...personnes.filter((x) => !equipe.has(x.id) && x.externe).map((x) => ({ value: x.id, label: x.nom, detail: x.organisation || undefined, groupe: "Hors division" })),
  ];
  // Archivé ou refusé : les livrables se lisent, sans se modifier (comme « Modifier le projet »).
  const modifiable = !p.archiveLe && p.statut !== "refuse";
  return { u, p, indicateurs, phases, enCours: phaseEnCours(phases, aujourdhui()), nTaches, personnes, optionsResponsable, modifiable };
}

/** Après « Nouveau livrable » : revenir à la fiche du projet (par défaut) ou à la liste des livrables. */
export const retourLivrable = (v: unknown): "projet" | "liste" => (v === "liste" ? "liste" : "projet");
