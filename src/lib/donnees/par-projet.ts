/**
 * Le travail d'une personne, projet par projet (demandé le 29 octobre 2026) : pour voir si un projet est négligé
 * par rapport aux autres et lequel prend le plus de son temps. Sur les quatre dernières semaines : tâches faites,
 * temps passé noté, réunions ; aujourd'hui : tâches ouvertes et heures estimées qui restent ; et la dernière
 * activité (tâche faite ou mise à jour). Pour soi et pour qui suit la personne (la page le vérifie) ; un projet que
 * le lecteur ne voit pas est compté dans « Autres projets », sans son nom.
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, dateLocale } from "@/lib/dates";
import { heuresDe } from "@/lib/charge";

export const JOURS_PAR_PROJET = 28;

export type LigneParProjet = {
  /** null : hors projet ; « autres » : projets que le lecteur ne voit pas. */
  projetId: string | null;
  cle: string;
  code: string | null;
  titre: string;
  ouvertes: number;
  enRetard: number;
  bloquees: number;
  faites: number;
  /** Heures estimées des tâches ouvertes (4 h pour une tâche sans estimation, comme la charge). */
  heuresRestantes: number;
  /** Temps passé noté sur la période, en minutes. */
  minutesNotees: number;
  /** Réunions de la période rattachées au projet, en minutes. */
  minutesReunions: number;
  /** Dernière tâche faite ou mise à jour (AAAA-MM-JJ). */
  derniereActivite: string | null;
  /** Des tâches ouvertes, mais rien de fait ni de mis à jour depuis 14 jours. */
  delaisse: boolean;
};

export async function travailParProjet(personneId: string, jour: string, visibles: Set<string> | "tous"): Promise<{ depuis: string; lignes: LigneParProjet[] }> {
  const depuis = ajouterJours(jour, -(JOURS_PAR_PROJET - 1));
  const [taches, temps, reunions] = await Promise.all([
    db
      .select({
        id: schema.taches.id,
        projetId: schema.taches.projetId,
        statut: schema.taches.statut,
        echeance: schema.taches.echeance,
        estimationHeures: schema.taches.estimationHeures,
        termineeLe: schema.taches.termineeLe,
        majLe: schema.taches.majLe,
      })
      .from(schema.taches)
      .where(and(eq(schema.taches.assigneId, personneId), isNull(schema.taches.annuleeLe))),
    db
      .select({ tacheId: schema.tempsPasse.tacheId, minutes: schema.tempsPasse.minutes, projetId: schema.taches.projetId })
      .from(schema.tempsPasse)
      .innerJoin(schema.taches, eq(schema.taches.id, schema.tempsPasse.tacheId))
      .where(and(eq(schema.tempsPasse.personneId, personneId), gte(schema.tempsPasse.jour, depuis), lte(schema.tempsPasse.jour, jour))),
    db
      .select({ projetId: schema.reunions.projetId, minutes: schema.reunions.dureeMinutes })
      .from(schema.participantsReunion)
      .innerJoin(schema.reunions, eq(schema.reunions.id, schema.participantsReunion.reunionId))
      .where(and(eq(schema.participantsReunion.personneId, personneId), gte(schema.reunions.jour, depuis), lte(schema.reunions.jour, jour))),
  ]);
  const ids = [...new Set([...taches.map((t) => t.projetId), ...temps.map((t) => t.projetId), ...reunions.map((r) => r.projetId)].filter((x): x is string => !!x))];
  const projets = ids.length ? await db.select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre }).from(schema.projets).where(inArray(schema.projets.id, ids)) : [];
  const parId = new Map(projets.map((p) => [p.id, p]));
  const voit = (id: string) => visibles === "tous" || visibles.has(id);
  const lignes = new Map<string, LigneParProjet>();
  const ligne = (projetId: string | null): LigneParProjet => {
    const cle = projetId === null ? "hors" : voit(projetId) ? projetId : "autres";
    let l = lignes.get(cle);
    if (!l) {
      const p = projetId && cle === projetId ? parId.get(projetId) : undefined;
      l = {
        projetId: cle === "hors" ? null : cle === "autres" ? "autres" : projetId,
        cle,
        code: p?.code ?? null,
        titre: cle === "hors" ? "Hors projet" : cle === "autres" ? "Autres projets" : (p?.titre ?? "?"),
        ouvertes: 0,
        enRetard: 0,
        bloquees: 0,
        faites: 0,
        heuresRestantes: 0,
        minutesNotees: 0,
        minutesReunions: 0,
        derniereActivite: null,
        delaisse: false,
      };
      lignes.set(cle, l);
    }
    return l;
  };
  const plusRecent = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
  for (const t of taches) {
    const faiteLe = t.termineeLe ? dateLocale(t.termineeLe) : null;
    if (t.statut === "faite") {
      if (!faiteLe || faiteLe < depuis) continue;
      const l = ligne(t.projetId);
      l.faites += 1;
      l.derniereActivite = plusRecent(l.derniereActivite, faiteLe);
      continue;
    }
    const l = ligne(t.projetId);
    l.ouvertes += 1;
    if (t.statut === "bloquee") l.bloquees += 1;
    else if (t.echeance && t.echeance < jour) l.enRetard += 1;
    l.heuresRestantes += heuresDe(t);
    l.derniereActivite = plusRecent(l.derniereActivite, dateLocale(t.majLe));
  }
  for (const x of temps) ligne(x.projetId).minutesNotees += x.minutes;
  for (const r of reunions) ligne(r.projetId).minutesReunions += r.minutes;
  const limite = ajouterJours(jour, -14);
  for (const l of lignes.values()) l.delaisse = l.ouvertes > 0 && l.projetId !== null && l.projetId !== "autres" && (!l.derniereActivite || l.derniereActivite < limite);
  // Les projets d'abord (le plus de temps en premier), puis « Hors projet » et « Autres projets ».
  const temps_ = (l: LigneParProjet) => l.heuresRestantes * 60 + l.minutesNotees + l.minutesReunions;
  const rang = (l: LigneParProjet) => (l.cle === "hors" ? 1 : l.cle === "autres" ? 2 : 0);
  return { depuis, lignes: [...lignes.values()].sort((x, y) => rang(x) - rang(y) || temps_(y) - temps_(x) || x.titre.localeCompare(y.titre, "fr")) };
}
