/**
 * Recherche unique : personnes, projets et tâches, seulement ce que la personne a le droit de voir
 * (mêmes règles que les pages : src/lib/acces.ts). Sans accents ni casse ; tous les mots doivent y être.
 */
import "server-only";
import { isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, contactsVisibles, idsProjetsVisibles, peutVoirTache } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/organisation";
import { cleNom } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";

const LIMITE = 20;

/** Rang d'un texte pour la requête : 0 commence par la requête, 1 un mot commence par elle, 2 la contient ; null sinon. */
export function rang(texte: string, mots: string[]): number | null {
  const t = cleNom(texte);
  if (!mots.length || !mots.every((m) => t.includes(m))) return null;
  const q = mots.join(" ");
  if (t.startsWith(q)) return 0;
  if (` ${t}`.includes(` ${mots[0]}`)) return 1;
  return 2;
}

const trierPar = <T extends { r: number; texte: string }>(l: T[]) => l.sort((x, y) => x.r - y.r || x.texte.localeCompare(y.texte, "fr"));

export async function rechercher(u: Utilisateur, saisie: string) {
  const mots = cleNom(saisie.slice(0, 100)).split(" ").filter((m) => m.length >= 2 || /\d/.test(m));
  if (!mots.length) return null;
  const a = await acces(u);
  const org = await chargerOrganisation();
  const visibles = await idsProjetsVisibles(a);
  const contacts = u.externe ? await contactsVisibles(a) : null;

  const personnes = trierPar(
    [...org.personnes.values()]
      .filter((p) => p.actif && (!contacts || contacts.has(p.id)))
      .map((p) => {
        const texte = nomComplet(p);
        const r = rang(`${texte} ${p.prenom} ${p.poste} ${p.externe ? p.organisation : org.equipes.get(p.equipeId ?? "")?.nom ?? ""}`, mots);
        const nom = rang(texte, mots);
        return { id: p.id, texte, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : [p.poste, contacts ? null : org.equipes.get(p.equipeId ?? "")?.nom].filter(Boolean).join(" · "), r: nom ?? (r === null ? null : r + 1) };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  const lesProjets = await db
    .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, programme: schema.projets.programme, statut: schema.projets.statut, archiveLe: schema.projets.archiveLe })
    .from(schema.projets);
  const projets = trierPar(
    lesProjets
      .filter((p) => visibles === "tous" || visibles.has(p.id))
      .map((p) => {
        const parCode = mots.length === 1 && cleNom(p.code) === mots[0] ? -1 : null;
        const r = parCode ?? rang(`${p.titre} ${p.code} ${p.programme}`, mots);
        return { id: p.id, code: p.code, texte: p.titre, sous: [p.programme, p.archiveLe ? "Archivé" : p.statut === "requete" ? "Demande" : p.statut === "refuse" ? "Refusé" : null].filter(Boolean).join(" · "), r };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  const codes = new Map(lesProjets.map((p) => [p.id, p.code]));
  const lesTaches = await db
    .select({ id: schema.taches.id, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, assigneId: schema.taches.assigneId, projetId: schema.taches.projetId, creeParId: schema.taches.creeParId })
    .from(schema.taches)
    .where(isNull(schema.taches.annuleeLe));
  const taches = trierPar(
    lesTaches
      .filter((t) => peutVoirTache(a, t))
      .map((t) => {
        const r = rang(t.titre, mots);
        const p = org.personnes.get(t.assigneId);
        return { id: t.id, texte: t.titre, code: t.projetId ? (codes.get(t.projetId) ?? null) : null, sous: [t.assigneId === u.id ? "Moi" : p ? nomComplet(p) : null, t.statut === "faite" ? "Faite" : t.statut === "bloquee" ? "Bloquée" : null].filter(Boolean).join(" · "), statut: t.statut, r: r === null ? null : r + (t.statut === "faite" ? 3 : 0) };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  return {
    personnes: { liste: personnes.slice(0, LIMITE), total: personnes.length },
    projets: { liste: projets.slice(0, LIMITE), total: projets.length },
    taches: { liste: taches.slice(0, LIMITE), total: taches.length },
  };
}
