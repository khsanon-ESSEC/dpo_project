/**
 * Première connexion guidée (29 octobre 2026) : sur Ma semaine, « Vos trois premiers gestes », choisis selon le
 * rôle, chacun relié à sa fiche du guide et à son « Le faire maintenant ». Un geste est coché quand les données
 * montrent qu'il a été fait (une tâche créée, un rapport envoyé…), ou qu'un écran a été ouvert pour les gestes
 * de lecture. La carte disparaît quand les trois sont faits, ou quand la personne la referme.
 * Pur (sans base) ; testé dans tests/accueil.test.ts.
 */

export type CleGeste = "tache_creee" | "tache_faite" | "rapport_envoye" | "tache_confiee" | "rapport_lu" | "charge_vue" | "portefeuille_vu" | "conseil_vu" | "tache_a_jour" | "temps_note";
export type ProfilAccueil = "agent" | "chef" | "direction" | "externe";
export type DefGeste = { cle: CleGeste; titre: string; fiche: string };

export const GESTES: Record<ProfilAccueil, DefGeste[]> = {
  agent: [
    { cle: "tache_creee", titre: "Ajouter une tâche dans la barre", fiche: "ajouter-une-tache" },
    { cle: "tache_faite", titre: "Cocher une tâche faite", fiche: "cocher-une-tache-faite" },
    { cle: "rapport_envoye", titre: "Envoyer mon rapport du vendredi", fiche: "envoyer-mon-rapport" },
  ],
  chef: [
    { cle: "tache_confiee", titre: "Confier une tâche à quelqu'un de l'équipe", fiche: "confier-une-tache" },
    { cle: "rapport_lu", titre: "Lire un rapport de l'équipe", fiche: "lire-les-rapports-de-l-equipe" },
    { cle: "charge_vue", titre: "Voir la charge de l'équipe", fiche: "voir-la-charge-de-l-equipe" },
  ],
  direction: [
    { cle: "portefeuille_vu", titre: "Parcourir le portefeuille des projets", fiche: "comprendre-la-sante-d-un-projet" },
    { cle: "rapport_lu", titre: "Lire un rapport de votre équipe", fiche: "lire-les-rapports-de-l-equipe" },
    { cle: "conseil_vu", titre: "Ouvrir le rapport au conseil", fiche: "relire-et-approuver-le-rapport-au-conseil" },
  ],
  externe: [
    { cle: "tache_a_jour", titre: "Mettre une tâche à jour", fiche: "mettre-a-jour-une-tache" },
    { cle: "tache_faite", titre: "Cocher une tâche faite", fiche: "cocher-une-tache-faite" },
    { cle: "temps_note", titre: "Noter le temps passé", fiche: "noter-le-temps-passe" },
  ],
};

/** Le profil d'accueil : hors division, direction (directeur ou exécutif), chef d'équipe, ou agent. */
export function profilAccueil(o: { externe?: boolean; executif: boolean; directeur: boolean; equipeDirecte: number }): ProfilAccueil {
  if (o.externe) return "externe";
  if (o.executif || o.directeur) return "direction";
  if (o.equipeDirecte > 0) return "chef";
  return "agent";
}

export type Geste = DefGeste & { fait: boolean };

/** Les trois gestes, cochés ou non ; null si la carte n'a plus lieu d'être (tout est fait, ou refermée). */
export function gestesAccueil(profil: ProfilAccueil, faits: ReadonlySet<CleGeste>, fermee: boolean): Geste[] | null {
  if (fermee) return null;
  const g = GESTES[profil].map((d) => ({ ...d, fait: faits.has(d.cle) }));
  return g.every((x) => x.fait) ? null : g;
}
