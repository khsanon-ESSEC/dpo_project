/**
 * Livrables d'un projet (décision du 28 octobre 2026) : un nom, une date prévue, un responsable. Le responsable
 * détermine et renseigne les tâches qui y mènent (il peut en confier à l'équipe du projet), puis le déclare
 * prêt à valider ; qui gère le projet le valide ou le renvoie avec une remarque. Les tâches hors livrable
 * restent possibles ; elles sont comptées. Règles pures : src/lib/projets.ts (peutAssigner, peutDeclarerPret).
 * Les pages et les actions vérifient l'accès au projet avant d'appeler ces fonctions.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { acteur } from "@/lib/donnees/gestion";
import type { Acces } from "@/lib/acces";
import { aujourdhui, dateCourte, dateLocale } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { apresLeLivrable, etatAffiche, peutDeclarerPret, peutGererProjet, responsableId as gestionnaireId, type EtatLivrable } from "@/lib/projets";
import { initiales, nomComplet } from "@/lib/regles";
import { recalculerSante } from "./sante";

export type TacheDeLivrable = {
  id: string;
  titre: string;
  statut: string;
  echeance: string | null;
  assigneId: string;
  nom: string;
  initiales: string;
  estimationHeures: number | null;
  retard: boolean;
  /** Prévue après la date du livrable. */
  apres: boolean;
};

export type Livrable = {
  id: string;
  projetId: string;
  ordre: number;
  libelle: string;
  critere: string;
  etat: EtatLivrable;
  /** L'état montré (« à venir » devient « en cours » dès qu'une tâche a commencé). */
  affiche: EtatLivrable;
  prevuLe: string | null;
  atteintLe: string | null;
  pretLe: string | null;
  responsableId: string | null;
  responsable: string | null;
  phaseId: string | null;
  validePar: string | null;
  remarque: string;
  taches: TacheDeLivrable[];
  compte: { total: number; faites: number; enCours: number; bloquees: number; retard: number; apres: number };
  /** Date dépassée sans que le livrable soit prêt ni validé. */
  enRetard: boolean;
};

const LIGNE_TACHE = {
  id: schema.taches.id,
  titre: schema.taches.titre,
  statut: schema.taches.statut,
  echeance: schema.taches.echeance,
  assigneId: schema.taches.assigneId,
  estimationHeures: schema.taches.estimationHeures,
  livrableId: schema.taches.livrableId,
  projetId: schema.taches.projetId,
};

/** Rang d'une tâche dans la liste d'un livrable : en retard, bloquées, en cours, à faire, faites. */
const rang = (t: TacheDeLivrable) => (t.statut === "faite" ? 4 : t.retard ? 0 : t.statut === "bloquee" ? 1 : t.statut === "en_cours" ? 2 : 3);

/** Les livrables de projets donnés, avec leurs tâches et leur avancement ; et les tâches hors livrable de chaque projet. */
export async function livrablesDe(projetIds: string[], jour = aujourdhui()) {
  if (!projetIds.length) return { livrables: [] as Livrable[], horsLivrable: new Map<string, { total: number; ouvertes: number }>() };
  const [lignes, taches, org] = await Promise.all([
    db.select().from(schema.indicateurs).where(inArray(schema.indicateurs.projetId, projetIds)).orderBy(asc(schema.indicateurs.ordre)),
    db
      .select(LIGNE_TACHE)
      .from(schema.taches)
      .where(and(inArray(schema.taches.projetId, projetIds), isNull(schema.taches.annuleeLe)))
      .orderBy(asc(schema.taches.echeance), asc(schema.taches.titre)),
    chargerOrganisation(),
  ]);
  const nom = (id: string | null) => (id && org.personnes.get(id) ? nomComplet(org.personnes.get(id)!) : null);
  const livrables: Livrable[] = lignes.map((l) => {
    const etat = l.etat as EtatLivrable;
    const enRetard = !!l.prevuLe && l.prevuLe < jour && etat !== "pret" && etat !== "atteint";
    const siennes: TacheDeLivrable[] = taches
      .filter((t) => t.livrableId === l.id)
      .map((t) => {
        const p = org.personnes.get(t.assigneId);
        return {
          id: t.id,
          titre: t.titre,
          statut: t.statut,
          echeance: t.echeance,
          assigneId: t.assigneId,
          nom: p ? nomComplet(p) : "—",
          initiales: p ? initiales(p) : "?",
          estimationHeures: t.estimationHeures,
          retard: t.statut !== "faite" && t.statut !== "bloquee" && !!t.echeance && t.echeance < jour,
          // Un livrable déjà en retard : toutes ses tâches ouvertes sont « après » ; on ne le répète pas.
          apres: !enRetard && apresLeLivrable(t, l.prevuLe),
        };
      })
      .sort((x, y) => rang(x) - rang(y) || (x.echeance ?? "9999").localeCompare(y.echeance ?? "9999"));
    return {
      id: l.id,
      projetId: l.projetId,
      ordre: l.ordre,
      libelle: l.libelle,
      critere: l.critere,
      etat,
      affiche: etatAffiche(etat, siennes),
      prevuLe: l.prevuLe,
      atteintLe: l.atteintLe,
      pretLe: l.pretLe ? dateLocale(l.pretLe) : null,
      responsableId: l.responsableId,
      responsable: nom(l.responsableId),
      phaseId: l.phaseId,
      validePar: nom(l.valideParId),
      remarque: l.remarque,
      taches: siennes,
      compte: {
        total: siennes.length,
        faites: siennes.filter((t) => t.statut === "faite").length,
        enCours: siennes.filter((t) => t.statut === "en_cours").length,
        bloquees: siennes.filter((t) => t.statut === "bloquee").length,
        retard: siennes.filter((t) => t.retard).length,
        apres: siennes.filter((t) => t.apres).length,
      },
      enRetard,
    };
  });
  const horsLivrable = new Map<string, { total: number; ouvertes: number }>();
  for (const t of taches) {
    if (t.livrableId || !t.projetId) continue;
    const h = horsLivrable.get(t.projetId) ?? { total: 0, ouvertes: 0 };
    h.total += 1;
    if (t.statut !== "faite") h.ouvertes += 1;
    horsLivrable.set(t.projetId, h);
  }
  return { livrables, horsLivrable };
}

export async function livrablesDuProjet(projetId: string, jour = aujourdhui()) {
  const { livrables, horsLivrable } = await livrablesDe([projetId], jour);
  return { livrables, horsLivrable: horsLivrable.get(projetId) ?? { total: 0, ouvertes: 0 } };
}

/** Les livrables qu'une personne a sous sa responsabilité, pas encore validés, sur les projets en cours. */
export async function mesLivrables(personneId: string, jour = aujourdhui()) {
  const miens = await db
    .select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, code: schema.projets.code, titre: schema.projets.titre })
    .from(schema.indicateurs)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.indicateurs.projetId))
    .where(
      and(
        eq(schema.indicateurs.responsableId, personneId),
        ne(schema.indicateurs.etat, "atteint"),
        isNull(schema.projets.archiveLe),
        inArray(schema.projets.statut, ["en_attente", "en_cours", "continu"]),
      ),
    );
  if (!miens.length) return [];
  const { livrables } = await livrablesDe([...new Set(miens.map((m) => m.projetId))], jour);
  const projet = new Map(miens.map((m) => [m.projetId, { code: m.code, titre: m.titre }]));
  const ids = new Set(miens.map((m) => m.id));
  return livrables
    .filter((l) => ids.has(l.id))
    .map((l) => ({ ...l, code: projet.get(l.projetId)!.code, projetTitre: projet.get(l.projetId)!.titre }))
    .sort((x, y) => (x.prevuLe ?? "9999").localeCompare(y.prevuLe ?? "9999"));
}

/** Un livrable et son projet (pour vérifier les droits). */
export async function livrableEtProjet(livrableId: string) {
  const [r] = await db
    .select({ livrable: schema.indicateurs, projet: schema.projets })
    .from(schema.indicateurs)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.indicateurs.projetId))
    .where(eq(schema.indicateurs.id, livrableId));
  return r ?? null;
}

/** Les livrables d'un projet, pour une liste de choix (formulaire de tâche). */
export async function choixDeLivrables(projetIds: string[]) {
  if (!projetIds.length) return {} as Record<string, { id: string; libelle: string; prevuLe: string | null; responsableId: string | null; etat: string }[]>;
  const l = await db
    .select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, libelle: schema.indicateurs.libelle, prevuLe: schema.indicateurs.prevuLe, responsableId: schema.indicateurs.responsableId, etat: schema.indicateurs.etat })
    .from(schema.indicateurs)
    .where(inArray(schema.indicateurs.projetId, projetIds))
    .orderBy(asc(schema.indicateurs.ordre));
  const r: Record<string, { id: string; libelle: string; prevuLe: string | null; responsableId: string | null; etat: string }[]> = {};
  for (const x of l) (r[x.projetId] ??= []).push({ id: x.id, libelle: x.libelle, prevuLe: x.prevuLe, responsableId: x.responsableId, etat: x.etat });
  return r;
}

export type ActionLivrable = "pret" | "valider" | "renvoyer" | "rouvrir";

/**
 * Le responsable déclare son livrable prêt à valider ; qui gère le projet le valide, le renvoie à reprendre
 * (avec une remarque) ou rouvre un livrable validé. Chacun est prévenu par une alerte.
 */
export async function agirSurLivrable(a: Acces, livrableId: string, action: ActionLivrable, remarque = ""): Promise<{ ok: true; message: string } | { erreur: string }> {
  const r = await livrableEtProjet(livrableId);
  if (!r) return { erreur: "Livrable introuvable." };
  const { livrable: l, projet: p } = r;
  if (p.archiveLe || p.statut === "requete" || p.statut === "refuse") return { erreur: "Ce projet n'est pas en cours." };
  const gere = peutGererProjet(acteur(a), p);
  const etat = l.etat as EtatLivrable;
  const moi = `${a.moi.prenom} ${a.moi.nom}`;
  const lien = `/projets/${p.id}#livrables`;
  const prevenir = async (personneId: string | null, texte: string) => {
    if (personneId && personneId !== a.moi.id) await db.insert(schema.notifications).values({ personneId, type: "projet", texte, lien });
  };
  if (action === "pret") {
    if (!peutDeclarerPret(a.moi.id, { responsableId: l.responsableId, etat }, gere)) return { erreur: etat === "pret" || etat === "atteint" ? "Ce livrable est déjà prêt ou validé." : "Seul son responsable (ou qui gère le projet) déclare ce livrable prêt." };
    await db.update(schema.indicateurs).set({ etat: "pret", pretLe: new Date(), remarque: "" }).where(eq(schema.indicateurs.id, l.id));
    await prevenir(gestionnaireId(p), `${moi} : « ${l.libelle} » (${p.code}) est prêt à valider`);
    await noter(a.moi.id, "livrable_pret", l.id, { projet: p.id });
  } else {
    if (!gere) return { erreur: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs valident un livrable." };
    if (action === "valider") {
      if (etat === "atteint") return { erreur: "Ce livrable est déjà validé." };
      await db.update(schema.indicateurs).set({ etat: "atteint", atteintLe: aujourdhui(), valideParId: a.moi.id, remarque: "" }).where(eq(schema.indicateurs.id, l.id));
      await prevenir(l.responsableId, `« ${l.libelle} » (${p.code}) est validé par ${moi}`);
    } else if (action === "renvoyer") {
      const m = remarque.replace(/\s+/g, " ").trim().slice(0, 500);
      if (etat !== "pret") return { erreur: "Seul un livrable prêt à valider se renvoie." };
      if (!m) return { erreur: "Dites en une phrase ce qui reste à reprendre." };
      await db.update(schema.indicateurs).set({ etat: "en_cours", pretLe: null, remarque: m }).where(eq(schema.indicateurs.id, l.id));
      await prevenir(l.responsableId, `« ${l.libelle} » (${p.code}) est à reprendre : ${m}`);
    } else {
      if (etat !== "atteint") return { erreur: "Seul un livrable validé se rouvre." };
      await db.update(schema.indicateurs).set({ etat: "en_cours", atteintLe: null, valideParId: null, pretLe: null }).where(eq(schema.indicateurs.id, l.id));
    }
    await noter(a.moi.id, `livrable_${action}`, l.id, { projet: p.id, remarque: action === "renvoyer" ? remarque.slice(0, 500) : undefined });
  }
  await recalculerSante([p.id]);
  const message = { pret: "Livrable déclaré prêt à valider.", valider: "Livrable validé.", renvoyer: "Livrable renvoyé à reprendre.", rouvrir: "Livrable rouvert." }[action];
  return { ok: true, message };
}

/** « prévu le 15 nov. », « en retard depuis le 15 nov. » : la date d'un livrable en clair. */
export function dateDuLivrable(l: Pick<Livrable, "prevuLe" | "enRetard">) {
  if (!l.prevuLe) return "sans date";
  return l.enRetard ? `prévu le ${dateCourte(l.prevuLe)}, en retard` : `prévu le ${dateCourte(l.prevuLe)}`;
}
