/**
 * Première connexion guidée (29 octobre 2026, revu le 30) : sur Ma semaine, « Vos trois premiers gestes ».
 *
 * À la première ouverture de la carte, on choisit, dans la liste des gestes utiles au rôle (dans l'ordre), les trois
 * premiers que la personne n'a pas encore faits : la carte ne s'ouvre jamais sur des gestes déjà faits, et qui
 * connaît déjà l'application ne la voit pas. Ce choix est gardé ; chaque geste choisi se coche quand les données
 * montrent qu'il a été fait (une tâche créée, un rapport envoyé…), ou qu'un écran a été ouvert pour les gestes
 * de lecture. La carte disparaît quand les gestes choisis sont faits, ou quand la personne la masque.
 * Pur (sans base) ; testé dans tests/accueil.test.ts.
 */

export type CleGeste =
  | "tache_creee"
  | "tache_faite"
  | "rapport_envoye"
  | "tache_a_jour"
  | "reunion_notee"
  | "temps_note"
  | "absence_notee"
  | "tache_confiee"
  | "rapport_lu"
  | "charge_vue"
  | "vues_projet"
  | "portefeuille_vu"
  | "conseil_vu";
export type ProfilAccueil = "agent" | "chef" | "direction" | "externe";
export type DefGeste = { cle: CleGeste; titre: string; fiche: string };

const G: Record<CleGeste, DefGeste> = {
  tache_creee: { cle: "tache_creee", titre: "Ajouter une tâche dans la barre", fiche: "ajouter-une-tache" },
  tache_faite: { cle: "tache_faite", titre: "Cocher une tâche faite", fiche: "cocher-une-tache-faite" },
  rapport_envoye: { cle: "rapport_envoye", titre: "Envoyer mon rapport du vendredi", fiche: "envoyer-mon-rapport" },
  tache_a_jour: { cle: "tache_a_jour", titre: "Mettre une tâche à jour", fiche: "mettre-a-jour-une-tache" },
  reunion_notee: { cle: "reunion_notee", titre: "Noter une réunion", fiche: "noter-une-reunion" },
  temps_note: { cle: "temps_note", titre: "Noter le temps passé", fiche: "noter-le-temps-passe" },
  absence_notee: { cle: "absence_notee", titre: "Noter une absence ou un congé", fiche: "noter-une-absence" },
  tache_confiee: { cle: "tache_confiee", titre: "Confier une tâche à quelqu'un de l'équipe", fiche: "confier-une-tache" },
  rapport_lu: { cle: "rapport_lu", titre: "Lire les rapports de l'équipe", fiche: "lire-les-rapports-de-l-equipe" },
  charge_vue: { cle: "charge_vue", titre: "Voir la charge de l'équipe", fiche: "voir-la-charge-de-l-equipe" },
  vues_projet: { cle: "vues_projet", titre: "Voir un projet en Gantt ou en calendrier", fiche: "voir-un-projet-autrement" },
  portefeuille_vu: { cle: "portefeuille_vu", titre: "Parcourir le portefeuille des projets", fiche: "comprendre-la-sante-d-un-projet" },
  conseil_vu: { cle: "conseil_vu", titre: "Ouvrir le rapport au conseil", fiche: "relire-et-approuver-le-rapport-au-conseil" },
};

/** Les gestes utiles à chaque rôle, du plus utile au moins urgent : la carte en propose trois pas encore faits. */
export const GESTES: Record<ProfilAccueil, DefGeste[]> = {
  agent: [G.tache_creee, G.tache_faite, G.rapport_envoye, G.tache_a_jour, G.reunion_notee, G.temps_note, G.absence_notee],
  chef: [G.tache_confiee, G.rapport_lu, G.charge_vue, G.reunion_notee, G.vues_projet, G.absence_notee],
  direction: [G.portefeuille_vu, G.rapport_lu, G.conseil_vu, G.charge_vue, G.vues_projet],
  externe: [G.tache_a_jour, G.tache_faite, G.temps_note],
};

export const NB_GESTES = 3;

/** Le profil d'accueil : hors division, direction (directeur ou exécutif), chef d'équipe, ou agent. */
export function profilAccueil(o: { externe?: boolean; executif: boolean; directeur: boolean; equipeDirecte: number }): ProfilAccueil {
  if (o.externe) return "externe";
  if (o.executif || o.directeur) return "direction";
  if (o.equipeDirecte > 0) return "chef";
  return "agent";
}

/** À la première ouverture : les trois premiers gestes du rôle pas encore faits (moins s'il en reste moins). */
export function choisirGestes(profil: ProfilAccueil, dejaFaits: ReadonlySet<CleGeste>): CleGeste[] {
  return GESTES[profil]
    .filter((g) => !dejaFaits.has(g.cle))
    .slice(0, NB_GESTES)
    .map((g) => g.cle);
}

export type Geste = DefGeste & { fait: boolean };

const DEF = new Map(Object.values(G).map((g) => [g.cle, g]));

/** Les gestes choisis, cochés ou non ; null si la carte n'a plus lieu d'être (rien à proposer, tout est fait, masquée). */
export function gestesAccueil(choisis: readonly string[], faits: ReadonlySet<CleGeste>, fermee: boolean): Geste[] | null {
  if (fermee) return null;
  const g = choisis
    .map((c) => DEF.get(c as CleGeste))
    .filter((d): d is DefGeste => !!d)
    .map((d) => ({ ...d, fait: faits.has(d.cle) }));
  return !g.length || g.every((x) => x.fait) ? null : g;
}

/** « Vos trois premiers gestes », « Vos deux premiers gestes », « Un geste pour prendre la main ». */
export function titreAccueil(n: number): string {
  return n >= 3 ? "Vos trois premiers gestes" : n === 2 ? "Vos deux premiers gestes" : "Un geste pour prendre la main";
}
