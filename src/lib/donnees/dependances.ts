/**
 * Dépendances entre tâches d'un même projet (décision du 28 octobre 2026) : une tâche attend qu'une autre soit
 * faite. Règles pures : src/lib/projets.ts (creeUneBoucle, commenceAvantSaPrecedente). Qui peut modifier la tâche
 * (src/lib/acces.ts) peut lui ajouter ou retirer une précédente, prise parmi les tâches du même projet.
 */
import "server-only";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { idsProjetsVisibles, peutModifierTache, type Acces } from "@/lib/acces";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { commenceAvantSaPrecedente, creeUneBoucle } from "@/lib/projets";
import { initiales, nomComplet } from "@/lib/regles";

export const MAX_PRECEDENTES = 10;

type Tache = typeof schema.taches.$inferSelect;

const LIGNE = {
  id: schema.taches.id,
  titre: schema.taches.titre,
  statut: schema.taches.statut,
  debut: schema.taches.debut,
  echeance: schema.taches.echeance,
  assigneId: schema.taches.assigneId,
  projetId: schema.taches.projetId,
  creeParId: schema.taches.creeParId,
  annuleeLe: schema.taches.annuleeLe,
};

/** Les tâches dont celle-ci dépend (précédentes) et celles qui dépendent d'elle (suivantes). */
export async function enchainementDe(t: Pick<Tache, "id" | "debut" | "echeance">) {
  const liens = await db.select().from(schema.dependancesTache).where(or(eq(schema.dependancesTache.tacheId, t.id), eq(schema.dependancesTache.precedenteId, t.id)));
  const ids = [...new Set(liens.map((l) => (l.tacheId === t.id ? l.precedenteId : l.tacheId)))];
  if (!ids.length) return { precedentes: [], suivantes: [], attend: [], conflits: [] };
  const [lignes, org] = await Promise.all([db.select(LIGNE).from(schema.taches).where(inArray(schema.taches.id, ids)), chargerOrganisation()]);
  const enLigne = (x: (typeof lignes)[number]) => {
    const p = org.personnes.get(x.assigneId);
    return { ...x, nom: p ? nomComplet(p) : "?", initiales: p ? initiales(p) : "?" };
  };
  const precedentes = liens.filter((l) => l.tacheId === t.id).map((l) => lignes.find((x) => x.id === l.precedenteId)).filter((x): x is (typeof lignes)[number] => !!x && !x.annuleeLe).map(enLigne);
  const suivantes = liens.filter((l) => l.precedenteId === t.id).map((l) => lignes.find((x) => x.id === l.tacheId)).filter((x): x is (typeof lignes)[number] => !!x && !x.annuleeLe).map(enLigne);
  return {
    precedentes,
    suivantes,
    /** Les précédentes pas encore faites : la tâche les attend. */
    attend: precedentes.filter((p) => p.statut !== "faite"),
    /** Les précédentes ouvertes dont la fin prévue tombe après le début prévu de la tâche. */
    conflits: precedentes.filter((p) => commenceAvantSaPrecedente(t, p)),
  };
}

/** Les tâches du même projet qu'on peut choisir comme précédente (ni elle-même, ni une suivante, ni annulée). */
export async function precedentesPossibles(t: Pick<Tache, "id" | "projetId">) {
  if (!t.projetId) return [];
  const [lignes, liens, org] = await Promise.all([
    db.select(LIGNE).from(schema.taches).where(and(eq(schema.taches.projetId, t.projetId), ne(schema.taches.id, t.id), isNull(schema.taches.annuleeLe))),
    db.select({ tacheId: schema.dependancesTache.tacheId, precedenteId: schema.dependancesTache.precedenteId }).from(schema.dependancesTache),
    chargerOrganisation(),
  ]);
  const paires = liens.map((l) => [l.tacheId, l.precedenteId] as [string, string]);
  const deja = new Set(paires.filter(([x]) => x === t.id).map(([, p]) => p));
  return lignes
    .filter((x) => !deja.has(x.id) && !creeUneBoucle(paires, t.id, x.id))
    .sort((x, y) => Number(x.statut === "faite") - Number(y.statut === "faite") || (x.echeance ?? "9999").localeCompare(y.echeance ?? "9999"))
    .map((x) => {
      const p = org.personnes.get(x.assigneId);
      return { id: x.id, titre: x.titre, statut: x.statut, echeance: x.echeance, nom: p ? nomComplet(p) : "?" };
    });
}

export async function ajouterDependance(a: Acces, t: Tache, precedenteId: string): Promise<{ ok: true } | { erreur: string }> {
  if (!peutModifierTache(a, t)) return { erreur: "Vous ne pouvez pas modifier cette tâche." };
  if (!t.projetId) return { erreur: "Une tâche hors projet n'a pas de dépendance : rattachez-la d'abord à un projet." };
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(t.projetId)) return { erreur: "Projet introuvable." };
  const [p] = await db.select(LIGNE).from(schema.taches).where(eq(schema.taches.id, precedenteId));
  if (!p || p.annuleeLe || p.projetId !== t.projetId) return { erreur: "Choisissez une tâche du même projet." };
  const liens = (await db.select({ tacheId: schema.dependancesTache.tacheId, precedenteId: schema.dependancesTache.precedenteId }).from(schema.dependancesTache)).map((l) => [l.tacheId, l.precedenteId] as [string, string]);
  if (liens.some(([x, y]) => x === t.id && y === p.id)) return { ok: true };
  if (creeUneBoucle(liens, t.id, p.id)) return { erreur: "Cette dépendance ferait une boucle : cette tâche-là attend déjà celle-ci." };
  if (liens.filter(([x]) => x === t.id).length >= MAX_PRECEDENTES) return { erreur: `Une tâche attend au plus ${MAX_PRECEDENTES} autres tâches.` };
  await db.insert(schema.dependancesTache).values({ tacheId: t.id, precedenteId: p.id, creeParId: a.moi.id }).onConflictDoNothing();
  await noter(a.moi.id, "dependance_ajoutee", t.id, { precedente: p.id });
  return { ok: true };
}

export async function retirerDependance(a: Acces, t: Tache, precedenteId: string): Promise<{ ok: true } | { erreur: string }> {
  if (!peutModifierTache(a, t)) return { erreur: "Vous ne pouvez pas modifier cette tâche." };
  await db.delete(schema.dependancesTache).where(and(eq(schema.dependancesTache.tacheId, t.id), eq(schema.dependancesTache.precedenteId, precedenteId)));
  await noter(a.moi.id, "dependance_retiree", t.id, { precedente: precedenteId });
  return { ok: true };
}

/**
 * Une tâche vient d'être faite : chaque tâche qui l'attendait et n'attend plus rien d'autre peut commencer ;
 * la personne à qui elle est confiée est prévenue (sauf si c'est elle qui vient de finir).
 */
export async function prevenirSuivantes(tacheId: string, auteurId: string) {
  const suivantes = await db.select({ tacheId: schema.dependancesTache.tacheId }).from(schema.dependancesTache).where(eq(schema.dependancesTache.precedenteId, tacheId));
  if (!suivantes.length) return 0;
  const [faite] = await db.select({ titre: schema.taches.titre }).from(schema.taches).where(eq(schema.taches.id, tacheId));
  let n = 0;
  for (const { tacheId: id } of suivantes) {
    const [s] = await db.select(LIGNE).from(schema.taches).where(eq(schema.taches.id, id));
    if (!s || s.annuleeLe || s.statut === "faite" || s.assigneId === auteurId) continue;
    const autres = await db
      .select({ statut: schema.taches.statut, annuleeLe: schema.taches.annuleeLe })
      .from(schema.dependancesTache)
      .innerJoin(schema.taches, eq(schema.taches.id, schema.dependancesTache.precedenteId))
      .where(eq(schema.dependancesTache.tacheId, id));
    if (autres.some((x) => !x.annuleeLe && x.statut !== "faite")) continue;
    await db.insert(schema.notifications).values({ personneId: s.assigneId, type: "tache", texte: `« ${faite?.titre ?? "Une tâche"} » est faite : vous pouvez commencer « ${s.titre} »`, lien: `/taches/${s.id}` });
    n += 1;
  }
  return n;
}

/** Pour le Gantt et la liste d'un projet : ce que chaque tâche attend encore. */
export async function attentesDuProjet(projetId: string) {
  const lignes = await db
    .select({ tacheId: schema.dependancesTache.tacheId, precedenteId: schema.dependancesTache.precedenteId, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, projetId: schema.taches.projetId, annuleeLe: schema.taches.annuleeLe })
    .from(schema.dependancesTache)
    .innerJoin(schema.taches, eq(schema.taches.id, schema.dependancesTache.precedenteId))
    .where(eq(schema.taches.projetId, projetId));
  const attend = new Map<string, { titre: string; echeance: string | null; statut: string }[]>();
  for (const l of lignes) if (!l.annuleeLe && l.statut !== "faite") attend.set(l.tacheId, [...(attend.get(l.tacheId) ?? []), { titre: l.titre, echeance: l.echeance, statut: l.statut }]);
  return attend;
}
