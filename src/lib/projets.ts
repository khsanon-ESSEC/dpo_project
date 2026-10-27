/**
 * Gestion des projets et des tâches : règles pures (sans base), testées dans tests/projets.test.ts.
 *
 * Décisions de la DPO (27 octobre 2026) :
 * - tout le monde peut proposer un projet ; il naît en « Requête » ; un directeur ou un exécutif
 *   l'accepte (et nomme le chef de projet) ou le refuse, avec un motif ;
 * - le chef de projet établit l'équipe du projet ; les membres voient le projet et reçoivent ses tâches ;
 * - on assigne une tâche à soi-même, aux personnes qu'on suit (chef d'équipe : son équipe ; directeur :
 *   sa direction ; exécutif : tout le monde), et, sur un projet qu'on dirige, aux membres de son équipe ;
 * - une tâche ou un projet sans activité se supprime vraiment ; sinon on annule la tâche ou on archive le
 *   projet, qui restent lisibles.
 */

export const STATUTS_PROJET = ["requete", "en_attente", "en_cours", "continu", "finalise", "refuse"] as const;
export type StatutProjet = (typeof STATUTS_PROJET)[number];

export const LIBELLE_STATUT_PROJET: Record<StatutProjet, string> = {
  requete: "Demande",
  en_attente: "En attente",
  en_cours: "En cours",
  continu: "Continu",
  finalise: "Finalisé",
  refuse: "Refusé",
};

/** Statuts qu'un projet accepté peut prendre (la demande et le refus passent par la décision). */
export const STATUTS_ACCEPTES: StatutProjet[] = ["en_attente", "en_cours", "continu", "finalise"];

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "en", "a", "au", "aux", "pour", "sur", "un", "une", "nouvelle", "nouveau", "projet"]);

/** Code de projet proposé à partir du titre : initiales des mots qui comptent (2 à 4 lettres), rendu unique. */
export function codeSuggere(titre: string, pris: Iterable<string>): string {
  const deja = new Set([...pris].map((c) => c.toUpperCase()));
  const mots = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((m) => m && !MOTS_VIDES.has(m.toLowerCase()));
  let base = mots.map((m) => m[0]).join("").slice(0, 3);
  if (base.length < 2) base = (mots[0] ?? "PR").slice(0, 2).padEnd(2, "X");
  if (!deja.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base.slice(0, 3)}${i}`.slice(0, 4);
    if (!deja.has(c)) return c;
  }
  return base;
}

/** Code valide : 2 à 4 lettres ou chiffres, en majuscules. */
export function codeValide(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(c) ? c : null;
}

export type Acteur = {
  moiId: string;
  /** Personnes suivies (soi compris), ou toutes. */
  suivis: Set<string> | "toutes";
  projetsDiriges: Set<string>;
  directeur: boolean;
  toutVoir: boolean;
};

const suit = (a: Acteur, id: string) => a.suivis === "toutes" || a.suivis.has(id);

/** Peut-on confier une tâche (de ce projet, ou hors projet) à cette personne ? */
export function peutAssigner(a: Acteur, assigneId: string, projet: { id: string; chefProjetId: string | null; membres: Set<string> } | null): boolean {
  if (assigneId === a.moiId || suit(a, assigneId)) return true;
  if (projet && a.projetsDiriges.has(projet.id)) return assigneId === projet.chefProjetId || projet.membres.has(assigneId);
  return false;
}

/**
 * Modifier un projet, gérer son équipe, l'archiver : son chef, la direction qui le voit, les exécutifs.
 * Une demande (ou un refus) n'a pas encore de chef : son auteur la corrige, la direction décide.
 */
export function peutGererProjet(a: Pick<Acteur, "moiId" | "directeur" | "toutVoir">, projet: { chefProjetId: string | null; statut?: string; demandeParId?: string | null }): boolean {
  if (a.toutVoir || a.directeur) return true;
  if (projet.statut === "requete" || projet.statut === "refuse") return projet.demandeParId === a.moiId;
  return projet.chefProjetId === a.moiId;
}

/** Projet qui reçoit des tâches : accepté, pas finalisé, pas archivé. */
export function projetOuvert(p: { statut: string; archiveLe: Date | null }): boolean {
  return !["requete", "refuse", "finalise"].includes(p.statut) && !p.archiveLe;
}

/** Décider d'une demande de projet : un directeur (qui la voit) ou un exécutif. */
export function peutDecider(a: Pick<Acteur, "directeur" | "toutVoir">): boolean {
  return a.toutVoir || a.directeur;
}

/**
 * Une tâche se supprime vraiment seulement si elle n'a pas d'histoire : pas faite, aucun événement
 * autre que sa création, et aucune ligne de rapport qui la cite. Sinon, on l'annule.
 */
export function tacheSupprimable(t: { statut: string; evenements: string[]; lignesRapport: number }): boolean {
  return t.statut !== "faite" && t.evenements.every((e) => e === "creation") && t.lignesRapport === 0;
}

/** Un projet se supprime vraiment seulement s'il n'a rien : ni tâche, ni rapport, ni historique, ni réunion. Sinon on l'archive. */
export function projetSupprimable(c: { taches: number; lignesRapport: number; reponsesRapport: number; lignesConseil: number; historique: number; reunions: number }): boolean {
  return Object.values(c).every((n) => n === 0);
}

// ---------------------------------------------------------------------------
// Réunions
// ---------------------------------------------------------------------------

export const DUREES_REUNION = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** « 1 h 30 », « 45 min » */
export function dureeTexte(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Durée saisie (minutes) : de 5 minutes à 10 heures. */
export function dureeValide(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 5 && n <= 600 ? n : null;
}
