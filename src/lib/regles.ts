/**
 * Règles de visibilité, sans base de données : faciles à tester et à relire.
 *
 * Qui voit quoi (décisions de la DPO, 27 octobre 2026) :
 * - chacun voit ses tâches et son rapport du vendredi ;
 * - le supérieur direct (un seul par personne) voit les rapports et les tâches des personnes
 *   qui lui rapportent ; si son poste est vacant, c'est le niveau suivant ;
 * - le chef de projet voit tout son projet, et dans les rapports du vendredi
 *   les seules lignes marquées de son projet ;
 * - le directeur voit les projets et les rapports des membres de sa direction :
 *   toutes les personnes placées sous lui, à tous les niveaux ;
 * - seuls les exécutifs voient tout ;
 * - l'administrateur gère l'organisation et les accès ; ce rôle peut être donné à
 *   n'importe qui et ne donne pas à lui seul accès aux rapports et aux tâches des autres.
 * Une même personne peut cumuler les rôles : chef de projet, chef d'équipe, directeur,
 * exécutif, administrateur.
 */

/** Rôles réglés à la main. Les autres (chef de projet, chef d'équipe) se déduisent des données. */
export type Roles = { directeur: boolean; executif: boolean; administrateur: boolean };

export type PersonneOrg = Roles & {
  id: string;
  prenom: string;
  nom: string;
  poste: string;
  courriel: string | null;
  equipeId: string | null;
  superieurId: string | null;
  actif: boolean;
  /** Hors division (autre département, consultant) : ni équipe, ni supérieur, ni rapport. */
  externe: boolean;
  /** Département ou société d'une personne hors division. */
  organisation: string;
  /** Peut se connecter (un mot de passe existe). */
  acces: boolean;
};

export type EquipeOrg = {
  id: string;
  nom: string;
  chefId: string | null;
  equipeParenteId: string | null;
};

export type OrgDonnees = {
  personnes: Map<string, PersonneOrg>;
  equipes: Map<string, EquipeOrg>;
};

type Moi = { id: string } & Pick<Roles, "directeur" | "executif">;

/** Seuls les exécutifs voient tout. */
export function voitTout(p: Pick<Roles, "executif">): boolean {
  return p.executif;
}

/**
 * Les exécutifs ne rédigent pas de rapport de la semaine : ils n'ont personne à qui l'envoyer.
 * Ils lisent ceux de tout le monde (décision du 27 octobre 2026).
 */
export function redigeUnRapport(p: Pick<Roles, "executif"> & { externe?: boolean }): boolean {
  // Une personne hors division n'a pas de supérieur ici : elle n'envoie pas de rapport non plus.
  return !p.executif && !p.externe;
}

export function peutAdministrer(p: Pick<Roles, "administrateur">): boolean {
  return p.administrateur;
}

function actif(org: OrgDonnees, id: string | null | undefined): PersonneOrg | null {
  if (!id) return null;
  const p = org.personnes.get(id);
  return p && p.actif ? p : null;
}

/**
 * Supérieur effectif : le supérieur désigné s'il est en poste ; sinon le responsable
 * de l'équipe ; sinon on remonte les équipes parentes (poste vacant).
 * Ne renvoie jamais la personne elle-même.
 */
export function resoudreSuperieur(org: OrgDonnees, personneId: string): PersonneOrg | null {
  const p = org.personnes.get(personneId);
  if (!p) return null;
  const designe = actif(org, p.superieurId);
  if (designe && designe.id !== p.id) return designe;

  const vues = new Set<string>();
  let equipeId = p.equipeId;
  while (equipeId && !vues.has(equipeId)) {
    vues.add(equipeId);
    const e = org.equipes.get(equipeId);
    if (!e) break;
    const chef = actif(org, e.chefId);
    if (chef && chef.id !== p.id) return chef;
    equipeId = e.equipeParenteId;
  }
  return null;
}

/** Personnes dont le rapport du vendredi arrive chez cette personne. */
export function subordonnesDirects(org: OrgDonnees, chefId: string): PersonneOrg[] {
  const liste: PersonneOrg[] = [];
  for (const p of org.personnes.values()) {
    if (!p.actif || p.id === chefId) continue;
    if (resoudreSuperieur(org, p.id)?.id === chefId) liste.push(p);
  }
  return liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Toute la direction d'une personne : ses subordonnés, les leurs, et ainsi de suite. */
export function membresDeLaDirection(org: OrgDonnees, chefId: string): Set<string> {
  const membres = new Set<string>();
  const aVoir = [chefId];
  while (aVoir.length) {
    const courant = aVoir.pop()!;
    for (const s of subordonnesDirects(org, courant)) {
      if (s.id === chefId || membres.has(s.id)) continue;
      membres.add(s.id);
      aVoir.push(s.id);
    }
  }
  return membres;
}

/** Est-ce que `moi` reçoit (directement) le rapport de `personneId` ? */
export function estSuperieurDe(org: OrgDonnees, moiId: string, personneId: string): boolean {
  return resoudreSuperieur(org, personneId)?.id === moiId;
}

/** Ensemble des personnes dont `moi` voit les tâches et les rapports complets. */
export function personnesSuivies(org: OrgDonnees, moi: Moi): Set<string> | "toutes" {
  if (voitTout(moi)) return "toutes";
  if (moi.directeur) return new Set([moi.id, ...membresDeLaDirection(org, moi.id)]);
  return new Set([moi.id, ...subordonnesDirects(org, moi.id).map((p) => p.id)]);
}

export type RapportRef = { auteurId: string; destinataireId: string | null; statut: "brouillon" | "envoye" };

/** Voir un rapport en entier. */
export function peutVoirRapportComplet(org: OrgDonnees, moi: Moi, r: RapportRef): boolean {
  if (r.auteurId === moi.id) return true;
  if (r.statut !== "envoye") return false; // un brouillon reste à son auteur
  if (voitTout(moi)) return true;
  if (r.destinataireId === moi.id) return true;
  if (estSuperieurDe(org, moi.id, r.auteurId)) return true;
  return moi.directeur && membresDeLaDirection(org, moi.id).has(r.auteurId);
}

/** Voir une ligne d'un rapport envoyé, en tant que chef du projet de la ligne. */
export function peutVoirLigneCommeChefDeProjet(moiId: string, r: RapportRef, ligne: { projetChefId: string | null }): boolean {
  return r.statut === "envoye" && ligne.projetChefId === moiId;
}

/** Rôles affichés d'une personne, réglés à la main ou déduits. */
export function libellesRoles(p: Roles & { nbRapports: number; nbProjetsDiriges: number }): string[] {
  return [
    p.nbRapports ? "Chef d'équipe" : null,
    p.nbProjetsDiriges ? "Chef de projet" : null,
    p.directeur ? "Directeur" : null,
    p.executif ? "Exécutif" : null,
    p.administrateur ? "Administrateur" : null,
  ].filter((x): x is string => x !== null);
}

export function nomComplet(p: { prenom: string; nom: string }): string {
  return `${p.prenom} ${p.nom}`.trim();
}

export function initiales(p: { prenom: string; nom: string }): string {
  const premiere = (s: string) => s.trim().charAt(0).toUpperCase();
  return `${premiere(p.prenom)}${premiere(p.nom)}`;
}
