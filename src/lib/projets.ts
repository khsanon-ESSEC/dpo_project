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
 *
 * Personnes hors division et projets d'autres divisions (décision du 27 octobre 2026) :
 * - une personne hors division (autre département, consultant) a une fiche, sans accès par défaut ;
 *   tout le monde peut l'ajouter au besoin (réunion, tâche, équipe projet) ;
 * - on lui confie une tâche hors projet, ou sur un projet qu'on dirige ; la direction et les exécutifs
 *   partout ; la personne qui lui a confié la tâche la suit et la met à jour ;
 * - un projet d'une autre division a un chef de projet hors division ; un référent de la DPO y a les
 *   droits de chef de projet ; il n'entre pas dans le rapport mensuel au conseil.
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

const suit = (a: Pick<Acteur, "suivis">, id: string) => a.suivis === "toutes" || a.suivis.has(id);

/** Qui a les droits de chef de projet dans l'application : le référent de la DPO s'il y en a un, sinon le chef. */
export function responsableId(p: { chefProjetId: string | null; referentId?: string | null }): string | null {
  return p.referentId ?? p.chefProjetId;
}

/** Peut-on confier une tâche (de ce projet, ou hors projet) à cette personne ? */
export function peutAssigner(a: Acteur, assigneId: string, projet: { id: string; chefProjetId: string | null; referentId?: string | null; membres: Set<string> } | null, externe = false): boolean {
  if (assigneId === a.moiId || suit(a, assigneId)) return true;
  // Hors division : hors projet, sur un projet qu'on dirige ; la direction et les exécutifs partout.
  if (externe) return !projet || a.projetsDiriges.has(projet.id) || a.directeur || a.toutVoir;
  if (projet && a.projetsDiriges.has(projet.id)) return assigneId === projet.chefProjetId || assigneId === projet.referentId || projet.membres.has(assigneId);
  return false;
}

/**
 * Modifier un projet, gérer son équipe, l'archiver : son responsable (le référent DPO, sinon le chef),
 * le directeur de la direction de ce responsable, les exécutifs. Un directeur ne gère pas le projet
 * d'une autre direction, même si l'un des siens y travaille.
 * Une demande (ou un refus) n'a pas encore de chef : son auteur la corrige ; le directeur de l'auteur aussi.
 */
export function peutGererProjet(a: Pick<Acteur, "moiId" | "directeur" | "toutVoir" | "suivis">, projet: { chefProjetId: string | null; referentId?: string | null; statut?: string; demandeParId?: string | null }): boolean {
  if (a.toutVoir) return true;
  if (projet.statut === "requete" || projet.statut === "refuse") return projet.demandeParId === a.moiId || (a.directeur && !!projet.demandeParId && suit(a, projet.demandeParId));
  const responsable = responsableId(projet);
  if (!responsable) return false;
  return responsable === a.moiId || (a.directeur && suit(a, responsable));
}

/**
 * Chef et référent d'un projet : un chef hors division demande un référent de la DPO, et le référent
 * est toujours de la DPO. Renvoie un message, ou null si c'est cohérent.
 */
export function verifierChefEtReferent(chef: { externe: boolean } | null, referent: { externe: boolean } | null): string | null {
  if (referent?.externe) return "Le référent est une personne de la DPO.";
  if (chef?.externe && !referent) return "Le chef de projet est hors division : nommez un référent de la DPO, qui gérera le projet ici.";
  return null;
}

/** Valeur de « Pour » qui demande une nouvelle personne hors division (son nom est saisi à côté). */
export const NOUVELLE_PERSONNE = "__externe";

/** « Prénom Nom » saisi d'un bloc → prénom (premier mot) et nom (le reste). */
export function separerNom(saisie: string): { prenom: string; nom: string } | null {
  const mots = saisie.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!mots.length) return null;
  return { prenom: mots[0].slice(0, 80), nom: mots.slice(1).join(" ").slice(0, 120) };
}

/** Clé de comparaison d'un nom (sans accents ni casse) : sert à éviter les doublons. */
export function cleNom(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
