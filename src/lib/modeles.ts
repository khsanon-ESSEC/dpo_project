/**
 * Modèles de rapport : ce que chacun remplit chaque semaine. Règles pures, sans base de données.
 *
 * Décisions de la DPO (27 octobre 2026) :
 * - seuls les administrateurs configurent les modèles (champs, ordre, propriétés, affectations) ;
 * - chaque personne remplit un seul modèle : celui qui lui est affecté nommément, sinon (si elle
 *   reçoit des rapports) le modèle des chefs d'équipe, sinon celui de son équipe, sinon le modèle
 *   par défaut ;
 * - le chef d'équipe et le directeur gardent leur propre rapport : « Mon travail » (le formulaire
 *   de leur équipe), puis la partie préremplie à partir des rapports qu'ils reçoivent ; un seul envoi ;
 * - un champ « son supérieur seulement » est caché à la direction et aux chefs de projet ; il ne
 *   remonte que si le chef le décide ; la charge ressentie ne remonte qu'en nombres ;
 * - un rapport envoyé garde le formulaire avec lequel il a été rempli ;
 * - rapports chaque semaine (le rapport au conseil est mensuel, ou ponctuel) ; chaque modèle fixe
 *   ses heures : prêt à relire, rappel, à envoyer avant.
 */
import { ajouterJours, dateCourte } from "./dates";

export const TYPES_CHAMP = ["lignes", "sante", "charge", "texte", "texte_long", "choix", "echelle", "nombre", "date", "piece_jointe", "intertitre", "note", "mon_travail", "reprise", "synthese"] as const;
export type TypeChamp = (typeof TYPES_CHAMP)[number];

/** Ce dont parle un champ : sert au préremplissage, à la reprise de la semaine dernière et au rapport du chef. */
export const RUBRIQUES = ["fait", "en_cours", "bloque", "prochaine", "decision", "autre"] as const;
export type Rubrique = (typeof RUBRIQUES)[number];

/** Ce qu'un champ « repris » rassemble des rapports reçus. */
export const REPRISES = ["a_decider", "sante", "charge", "fait", "en_cours", "prochaine"] as const;
export type Reprise = (typeof REPRISES)[number];

export const VISIBILITES = ["tous", "direction", "superieur"] as const;
export type Visibilite = (typeof VISIBILITES)[number];
/** Visibilité d'une ligne : celle de son champ, ou « auteur » pour un élément reçu à titre privé. */
export type VisibiliteLigne = Visibilite | "auteur";

export type Champ = {
  /** Identifiant stable dans le modèle : [a-z0-9_], 40 caractères au plus. */
  id: string;
  type: TypeChamp;
  libelle: string;
  aide?: string;
  obligatoire?: boolean;
  /** Lignes, textes : de quoi parle le champ. */
  rubrique?: Rubrique;
  /** Lignes : préparées à partir des tâches ; santé : feu de la semaine dernière ; charge : niveau calculé. */
  prerempli?: boolean;
  /** Lignes : chaque ligne porte son projet (le chef de projet la voit). */
  parProjet?: boolean;
  visibilite?: Visibilite;
  /** Choix et échelle. */
  options?: string[];
  /** Champ repris des rapports reçus (modèles de chef). */
  reprise?: Reprise;
  /** Rapport de chef, une fois déplié : son propre travail, ou ce qu'il reçoit de son équipe. */
  partie?: "travail" | "equipe";
};

export type Genre = "individuel" | "chef";

export const CATALOGUE: Record<TypeChamp, { nom: string; detail: string; groupe: "chef" | "application" | "remplir" | "page" }> = {
  mon_travail: { nom: "Mon travail", detail: "Le formulaire de son équipe, pour ses propres points", groupe: "chef" },
  reprise: { nom: "Repris des rapports reçus", detail: "Lignes et réponses de l'équipe", groupe: "chef" },
  synthese: { nom: "Synthèse par projet", detail: "Quelques phrases par projet, proposées", groupe: "chef" },
  lignes: { nom: "Lignes par projet", detail: "Préremplies avec les tâches", groupe: "application" },
  sante: { nom: "Santé des projets", detail: "Un feu par projet suivi", groupe: "application" },
  charge: { nom: "Charge de la semaine", detail: "Niveau proposé, ressenti corrigé", groupe: "application" },
  texte: { nom: "Texte court", detail: "Une phrase", groupe: "remplir" },
  texte_long: { nom: "Texte long", detail: "Quelques lignes", groupe: "remplir" },
  choix: { nom: "Choix dans une liste", detail: "Une réponse parmi plusieurs", groupe: "remplir" },
  echelle: { nom: "Échelle", detail: "De 1 à 5", groupe: "remplir" },
  nombre: { nom: "Nombre", detail: "Une valeur chiffrée", groupe: "remplir" },
  date: { nom: "Date", detail: "Un jour du calendrier", groupe: "remplir" },
  piece_jointe: { nom: "Pièce jointe", detail: "PDF, image, Word, Excel…", groupe: "remplir" },
  intertitre: { nom: "Intertitre", detail: "Sépare deux parties", groupe: "page" },
  note: { nom: "Note pour la personne", detail: "Un texte d'explication", groupe: "page" },
};

export const GROUPES_CATALOGUE: { id: "chef" | "application" | "remplir" | "page"; titre: string }[] = [
  { id: "chef", titre: "Pour les rapports de chef" },
  { id: "application", titre: "Préparés par l'application" },
  { id: "remplir", titre: "À remplir" },
  { id: "page", titre: "Mise en page" },
];

export const LIBELLE_RUBRIQUE: Record<Rubrique, string> = {
  fait: "Ce qui est fait",
  en_cours: "Ce qui est en cours",
  bloque: "Ce qui bloque",
  prochaine: "Ce qui est prévu ensuite",
  decision: "Une décision ou une aide attendue",
  autre: "Autre chose (pas repris dans le rapport du chef)",
};

export const LIBELLE_REPRISE: Record<Reprise, string> = {
  a_decider: "À décider ou débloquer (blocages, décisions attendues)",
  sante: "Santé des projets (le feu le plus préoccupant)",
  charge: "Charge (le détail pour le chef, les nombres au-dessus)",
  fait: "Ce qui est fait, par projet",
  en_cours: "Ce qui est en cours, par projet",
  prochaine: "Ce qui est prévu ensuite, par projet",
};

export const LIBELLE_VISIBILITE: Record<Visibilite, { titre: string; detail: string; court: string }> = {
  tous: { titre: "Tous ses lecteurs", detail: "Supérieur, direction, et chaque chef de projet pour ses lignes", court: "" },
  direction: { titre: "Supérieur et direction", detail: "Pas les chefs de projet", court: "Sans les chefs de projet" },
  superieur: { titre: "Son supérieur seulement", detail: "Ni la direction, ni les chefs de projet", court: "Supérieur seulement" },
};

export const NIVEAUX_SANTE = [
  { valeur: "dans_les_temps", libelle: "Dans les temps" },
  { valeur: "a_surveiller", libelle: "À surveiller" },
  { valeur: "en_retard", libelle: "En retard" },
] as const;
export type ValeurSante = (typeof NIVEAUX_SANTE)[number]["valeur"];

export const NIVEAUX_RESSENTI = [
  { valeur: "legere", libelle: "Légère" },
  { valeur: "normale", libelle: "Normale" },
  { valeur: "lourde", libelle: "Lourde" },
  { valeur: "trop_lourde", libelle: "Trop lourde" },
] as const;
export type ValeurRessenti = (typeof NIVEAUX_RESSENTI)[number]["valeur"];

/** Niveau de charge calculé (src/lib/charge.ts) → ressenti proposé. */
export function ressentiPropose(niveau: "libre" | "normale" | "chargee" | "surchargee"): ValeurRessenti {
  return ({ libre: "legere", normale: "normale", chargee: "lourde", surchargee: "trop_lourde" } as const)[niveau];
}

export const libelleSante = (v: string | null | undefined) => NIVEAUX_SANTE.find((n) => n.valeur === v)?.libelle ?? "";
export const libelleRessenti = (v: string | null | undefined) => NIVEAUX_RESSENTI.find((n) => n.valeur === v)?.libelle ?? "";

/** Les quatre parties d'avant les modèles : le modèle par défaut, et la lecture des anciens rapports. */
export const FORMULAIRE_PAR_DEFAUT: Champ[] = [
  { id: "fait", type: "lignes", libelle: "Fait", rubrique: "fait", prerempli: true, parProjet: true, visibilite: "tous" },
  { id: "en_cours", type: "lignes", libelle: "En cours", rubrique: "en_cours", prerempli: true, parProjet: true, visibilite: "tous" },
  { id: "bloque", type: "lignes", libelle: "Bloqué", rubrique: "bloque", prerempli: true, parProjet: true, visibilite: "tous" },
  { id: "prochaine", type: "lignes", libelle: "La semaine prochaine", rubrique: "prochaine", prerempli: true, parProjet: true, visibilite: "tous" },
];

const RUBRIQUES_PAR_TYPE: Partial<Record<TypeChamp, readonly Rubrique[]>> = {
  lignes: ["fait", "en_cours", "bloque", "prochaine", "decision", "autre"],
  texte: ["decision", "autre"],
  texte_long: ["decision", "autre"],
};
export const rubriquesPossibles = (t: TypeChamp): readonly Rubrique[] => RUBRIQUES_PAR_TYPE[t] ?? [];

/** Champs sans réponse (titres, notes, renvois). */
export const estDecoratif = (c: Pick<Champ, "type">) => c.type === "intertitre" || c.type === "note" || c.type === "mon_travail";
export const peutEtreObligatoire = (t: TypeChamp) => !["intertitre", "note", "mon_travail", "reprise", "synthese"].includes(t);
export const aUneVisibilite = (t: TypeChamp) => !["intertitre", "note", "mon_travail"].includes(t);

function identifiantLibre(base: string, pris: Set<string>): string {
  const propre =
    base
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "champ";
  let id = propre;
  for (let i = 2; pris.has(id); i++) id = `${propre}_${i}`;
  return id;
}

/** Un champ neuf, avec des réglages sensés pour son type. */
export function nouveauChamp(type: TypeChamp, pris: Iterable<string>): Champ {
  const ids = new Set(pris);
  const D: Record<TypeChamp, Omit<Champ, "id" | "type">> = {
    lignes: { libelle: "Nouvelle liste", rubrique: "autre", prerempli: false, parProjet: true },
    sante: { libelle: "Santé de mes projets", prerempli: true, obligatoire: true },
    charge: { libelle: "Ma charge cette semaine", prerempli: true, visibilite: "superieur" },
    texte: { libelle: "Question courte", rubrique: "autre" },
    texte_long: { libelle: "Commentaire", rubrique: "autre" },
    choix: { libelle: "Choix", options: ["Option 1", "Option 2", "Option 3"] },
    echelle: { libelle: "Note de 1 à 5", options: ["1", "2", "3", "4", "5"] },
    nombre: { libelle: "Nombre" },
    date: { libelle: "Date" },
    intertitre: { libelle: "Intertitre" },
    note: { libelle: "Note", aide: "Texte affiché à la personne qui remplit le rapport." },
    mon_travail: { libelle: "Mon travail", aide: "Le formulaire de votre équipe, préparé à partir de vos propres tâches." },
    reprise: { libelle: "Repris de l'équipe", reprise: "a_decider" },
    synthese: { libelle: "Synthèse par projet", aide: "Proposée à partir des rapports reçus ; à relire et à reformuler.", visibilite: "direction" },
    piece_jointe: { libelle: "Pièces jointes", aide: "Un compte rendu, une capture, un tableau : 10 Mo au plus par fichier." },
  };
  const c: Champ = { id: identifiantLibre(D[type].libelle, ids), type, ...D[type] };
  if (aUneVisibilite(type) && !c.visibilite) c.visibilite = "tous";
  return c;
}

export type Validation = { ok: true; champs: Champ[] } | { ok: false; erreur: string };

const court = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/**
 * Nettoie et vérifie la liste des champs d'un modèle avant de l'enregistrer.
 * Tout ce qui n'est pas prévu est retiré ; une incohérence renvoie une erreur lisible.
 */
export function validerChamps(entree: unknown, genre: Genre): Validation {
  if (!Array.isArray(entree)) return { ok: false, erreur: "Liste de champs illisible." };
  if (entree.length > 40) return { ok: false, erreur: "Quarante champs au plus." };
  const ids = new Set<string>();
  const champs: Champ[] = [];
  let travail = 0;
  for (const brut of entree as Record<string, unknown>[]) {
    const type = brut?.type as TypeChamp;
    if (!TYPES_CHAMP.includes(type)) return { ok: false, erreur: "Type de champ inconnu." };
    const id = court(brut.id, 40);
    if (!/^[a-z0-9_]{1,40}$/.test(id)) return { ok: false, erreur: "Identifiant de champ invalide." };
    if (ids.has(id)) return { ok: false, erreur: `Deux champs portent l'identifiant « ${id} ».` };
    ids.add(id);
    const libelle = court(brut.libelle, 120);
    if (!libelle) return { ok: false, erreur: "Chaque champ a besoin d'un libellé." };
    const c: Champ = { id, type, libelle };
    const aide = court(brut.aide, 400);
    if (aide) c.aide = aide;
    if (type === "mon_travail" || type === "reprise" || type === "synthese") {
      if (genre !== "chef") return { ok: false, erreur: `« ${CATALOGUE[type].nom} » n'existe que dans un modèle de chef.` };
    }
    if (type === "mon_travail") travail += 1;
    if (peutEtreObligatoire(type) && brut.obligatoire === true) c.obligatoire = true;
    const rubriques = rubriquesPossibles(type);
    if (rubriques.length) {
      const r = brut.rubrique as Rubrique;
      c.rubrique = rubriques.includes(r) ? r : "autre";
    }
    if (type === "lignes" || type === "sante" || type === "charge") c.prerempli = brut.prerempli === true;
    if (type === "lignes") c.parProjet = brut.parProjet !== false;
    if (aUneVisibilite(type)) c.visibilite = VISIBILITES.includes(brut.visibilite as Visibilite) ? (brut.visibilite as Visibilite) : "tous";
    if (type === "choix" || type === "echelle") {
      const options = Array.isArray(brut.options) ? [...new Set((brut.options as unknown[]).map((o) => court(o, 60)).filter(Boolean))] : [];
      if (options.length < 2 || options.length > 10) return { ok: false, erreur: `« ${libelle} » : entre deux et dix réponses possibles.` };
      c.options = options;
    }
    if (type === "reprise") {
      const r = brut.reprise as Reprise;
      if (!REPRISES.includes(r)) return { ok: false, erreur: `« ${libelle} » : choisir ce qui est repris.` };
      c.reprise = r;
    }
    champs.push(c);
  }
  if (travail > 1) return { ok: false, erreur: "Un seul champ « Mon travail » par modèle." };
  if (!champs.some((c) => !estDecoratif(c) || c.type === "mon_travail")) return { ok: false, erreur: "Le modèle doit contenir au moins un champ à remplir." };
  return { ok: true, champs };
}

/**
 * Formulaire réellement rempli : pour un modèle de chef, « Mon travail » est remplacé par le
 * formulaire individuel de la personne (son équipe), suivi de ce qu'elle reçoit.
 */
export function deplier(champs: Champ[], genre: Genre, individuel: Champ[]): Champ[] {
  if (genre !== "chef") return champs.map((c) => ({ ...c }));
  const pris = new Set(champs.map((c) => c.id));
  const sortie: Champ[] = [];
  for (const c of champs) {
    if (c.type === "mon_travail") {
      sortie.push({ id: c.id, type: "intertitre", libelle: c.libelle, aide: c.aide, partie: "travail" });
      for (const f of individuel) {
        if (f.type === "mon_travail" || f.type === "reprise") continue;
        const id = pris.has(f.id) ? identifiantLibre(`t_${f.id}`, pris) : f.id;
        pris.add(id);
        sortie.push({ ...f, id, partie: "travail" });
      }
    } else {
      sortie.push({ ...c, partie: "equipe" });
    }
  }
  return sortie;
}

/** Résolution du modèle d'une personne. */
export type ModeleRef = { id: string; genre: Genre; parDefaut: boolean; pourChefs: boolean; actif: boolean };
export type AffectationRef = { modeleId: string; equipeId: string | null; personneId: string | null };

export function resoudreModele(
  personneId: string,
  equipes: string[],
  estChef: boolean,
  modeles: ModeleRef[],
  affectations: AffectationRef[],
): { modeleId: string | null; individuelId: string | null } {
  const actifs = new Map(modeles.filter((m) => m.actif).map((m) => [m.id, m]));
  const nominatif = affectations.map((a) => (a.personneId === personneId ? actifs.get(a.modeleId) : undefined)).find(Boolean) ?? null;
  const pourChefs = estChef ? (modeles.find((m) => m.actif && m.pourChefs) ?? null) : null;
  let parEquipe: ModeleRef | null = null;
  for (const e of equipes) {
    const a = affectations.find((x) => x.equipeId === e && actifs.get(x.modeleId)?.genre === "individuel");
    if (a) {
      parEquipe = actifs.get(a.modeleId)!;
      break;
    }
  }
  const defaut = modeles.find((m) => m.actif && m.parDefaut && m.genre === "individuel") ?? null;
  const modele = nominatif ?? pourChefs ?? parEquipe ?? defaut;
  const individuel = modele?.genre === "individuel" ? modele : (parEquipe ?? defaut);
  return { modeleId: modele?.id ?? null, individuelId: individuel?.id ?? null };
}

/**
 * Qui lit, et ce qu'il voit d'un champ :
 * - auteur : tout ;
 * - superieur : le destinataire du rapport (son supérieur direct) ;
 * - direction : les directeurs au-dessus, et les exécutifs ;
 * - chef_projet : seulement les lignes et les feux de son projet, dans les champs ouverts à tous.
 */
export type Lecteur = "auteur" | "superieur" | "direction" | "chef_projet";

export function voitVisibilite(lecteur: Lecteur, v: VisibiliteLigne): boolean {
  if (lecteur === "auteur") return true;
  if (v === "auteur") return false;
  if (lecteur === "superieur") return true;
  if (lecteur === "direction") return v === "tous" || v === "direction";
  return v === "tous";
}

/** Visibilité d'une ligne : celle de son champ, sauf élément reçu à titre privé et non remonté. */
export function visibiliteDeLigne(champ: Pick<Champ, "visibilite">, ligne: { visibilite: string | null; remonte: boolean }): VisibiliteLigne {
  const duChamp = champ.visibilite ?? "tous";
  if (ligne.remonte || !ligne.visibilite) return duChamp;
  return ligne.visibilite as VisibiliteLigne;
}

const RANG_SANTE: Record<string, number> = { dans_les_temps: 0, a_surveiller: 1, en_retard: 2 };

/** Le feu le plus préoccupant d'une liste (vide = aucun). */
export function pireSante(valeurs: (string | null | undefined)[]): ValeurSante | null {
  let pire: ValeurSante | null = null;
  for (const v of valeurs) {
    if (!v || !(v in RANG_SANTE)) continue;
    if (pire === null || RANG_SANTE[v] > RANG_SANTE[pire]) pire = v as ValeurSante;
  }
  return pire;
}

/** Charge d'une équipe en nombres : ce qui remonte au-dessus du chef. */
export type ComptesCharge = {
  calcule: Record<"libre" | "normale" | "chargee" | "surchargee", number>;
  ressenti: Record<ValeurRessenti | "aucun", number>;
};

export function comptesVides(): ComptesCharge {
  return { calcule: { libre: 0, normale: 0, chargee: 0, surchargee: 0 }, ressenti: { legere: 0, normale: 0, lourde: 0, trop_lourde: 0, aucun: 0 } };
}

export function additionnerComptes(a: ComptesCharge, b: ComptesCharge): ComptesCharge {
  const s = comptesVides();
  for (const k of Object.keys(s.calcule) as (keyof ComptesCharge["calcule"])[]) s.calcule[k] = (a.calcule[k] ?? 0) + (b.calcule[k] ?? 0);
  for (const k of Object.keys(s.ressenti) as (keyof ComptesCharge["ressenti"])[]) s.ressenti[k] = (a.ressenti[k] ?? 0) + (b.ressenti[k] ?? 0);
  return s;
}

export function lireComptes(texte: string | null | undefined): ComptesCharge | null {
  if (!texte) return null;
  try {
    const o = JSON.parse(texte);
    if (!o || typeof o !== "object" || !o.calcule || !o.ressenti) return null;
    return additionnerComptes(comptesVides(), o as ComptesCharge);
  } catch {
    return null;
  }
}

export function texteComptes(c: ComptesCharge): string {
  const n = c.calcule;
  const morceaux = [
    n.surchargee ? `${n.surchargee} surchargée${n.surchargee > 1 ? "s" : ""}` : null,
    n.chargee ? `${n.chargee} chargée${n.chargee > 1 ? "s" : ""}` : null,
    n.normale ? `${n.normale} normale${n.normale > 1 ? "s" : ""}` : null,
    n.libre ? `${n.libre} avec de la marge` : null,
  ].filter(Boolean);
  const lourds = c.ressenti.lourde + c.ressenti.trop_lourde;
  return (morceaux.join(", ") || "Personne") + (lourds ? ` ; ${lourds} ressenti${lourds > 1 ? "s" : ""} « lourde » ou plus` : "");
}

/** Contenu d'un rapport, résumé pour vérifier les champs obligatoires. */
export type Remplissage = {
  lignes: Map<string, number>;
  /** champId → valeurs (une par projet pour la santé). */
  reponses: Map<string, string[]>;
  /** Santé : nombre de projets à noter, par champ. */
  projetsANoter?: Map<string, number>;
  /** Pièces jointes déposées, par champ. */
  pieces?: Map<string, number>;
};

export function champsManquants(formulaire: Champ[], r: Remplissage): Champ[] {
  return formulaire.filter((c) => {
    if (!c.obligatoire || estDecoratif(c) || c.type === "reprise") return false;
    if (c.type === "lignes") return (r.lignes.get(c.id) ?? 0) === 0;
    if (c.type === "piece_jointe") return (r.pieces?.get(c.id) ?? 0) === 0;
    const vals = (r.reponses.get(c.id) ?? []).filter((v) => v.trim() !== "");
    if (c.type === "sante") {
      const attendus = r.projetsANoter?.get(c.id) ?? 0;
      return attendus > 0 && vals.length < attendus;
    }
    return vals.length === 0;
  });
}

/** Valeur acceptable pour un champ (null = refusée). */
export function valeurAcceptable(c: Champ, valeur: string): string | null {
  const v = valeur.trim();
  if (v === "") return "";
  switch (c.type) {
    case "sante":
      return NIVEAUX_SANTE.some((n) => n.valeur === v) ? v : null;
    case "charge":
      return NIVEAUX_RESSENTI.some((n) => n.valeur === v) ? v : null;
    case "choix":
    case "echelle":
      return c.options?.includes(v) ? v : null;
    case "nombre": {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && Math.abs(n) < 1e12 ? String(n) : null;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null;
    case "texte":
      return v.slice(0, 300);
    case "texte_long":
      return v.slice(0, 2000);
    case "synthese":
      return v.slice(0, 1500);
    default:
      return null;
  }
}

/** Libellé d'un champ dans une liste (éditeur, aperçu). */
export function resumeChamp(c: Champ): string {
  const m: string[] = [CATALOGUE[c.type].nom];
  if (c.type === "reprise" && c.reprise) m.push(`repris : ${LIBELLE_REPRISE[c.reprise].split(" (")[0].toLowerCase()}`);
  if (c.type === "lignes" && c.rubrique && c.rubrique !== "autre") m.push(LIBELLE_RUBRIQUE[c.rubrique].toLowerCase());
  if (c.prerempli) m.push("prérempli");
  if (peutEtreObligatoire(c.type)) m.push(c.obligatoire ? "obligatoire" : "facultatif");
  return m.join(" · ");
}

// ---------------------------------------------------------------------------
// Heures de la semaine : prêt à relire, rappel, à envoyer avant
// ---------------------------------------------------------------------------

/** Un moment de la semaine du rapport : jour 1 (lundi) à 7 (dimanche), 8 = le lundi suivant ; heure « HH:MM ». */
export type Moment = { jour: number; heure: string };
export type Horaires = { pret: Moment; rappel: Moment | null; limite: Moment | null };

export const HORAIRES_PAR_DEFAUT: Horaires = {
  pret: { jour: 5, heure: "10:00" },
  rappel: { jour: 5, heure: "14:00" },
  limite: { jour: 5, heure: "17:00" },
};

export const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lundi suivant"] as const;

const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesDe = (m: Moment) => (m.jour - 1) * 1440 + Number(m.heure.slice(0, 2)) * 60 + Number(m.heure.slice(3, 5));

function lireMoment(brut: unknown): Moment | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const jour = Number(o.jour);
  const heure = typeof o.heure === "string" ? o.heure.trim() : "";
  if (!Number.isInteger(jour) || jour < 1 || jour > 8 || !HEURE.test(heure)) return null;
  return { jour, heure };
}

/** Horaires d'un modèle (vides ou illisibles : ceux par défaut). */
export function horairesDe(brut: unknown): Horaires {
  const v = validerHoraires(brut);
  return v.ok ? v.horaires : HORAIRES_PAR_DEFAUT;
}

export function validerHoraires(brut: unknown): { ok: true; horaires: Horaires } | { ok: false; erreur: string } {
  if (!brut || typeof brut !== "object") return { ok: false, erreur: "Horaires illisibles." };
  const o = brut as Record<string, unknown>;
  const pret = lireMoment(o.pret);
  if (!pret) return { ok: false, erreur: "Indiquez quand le rapport est prêt à relire." };
  const rappel = o.rappel ? lireMoment(o.rappel) : null;
  const limite = o.limite ? lireMoment(o.limite) : null;
  if (o.rappel && !rappel) return { ok: false, erreur: "Heure de rappel illisible." };
  if (o.limite && !limite) return { ok: false, erreur: "Heure limite illisible." };
  if (rappel && minutesDe(rappel) < minutesDe(pret)) return { ok: false, erreur: "Le rappel vient après « prêt à relire »." };
  if (limite && minutesDe(limite) < minutesDe(rappel ?? pret)) return { ok: false, erreur: "L'heure limite vient après le rappel et « prêt à relire »." };
  return { ok: true, horaires: { pret, rappel, limite } };
}

/** « vendredi à 17 h » ; avec la semaine : « vendredi 30 oct. à 17 h ». */
export function texteMoment(m: Moment, semaine?: string): string {
  const [h, mn] = m.heure.split(":");
  const heure = `${Number(h)} h${mn === "00" ? "" : ` ${mn}`}`;
  const jour = JOURS_SEMAINE[m.jour - 1];
  return semaine ? `${jour === "lundi suivant" ? "lundi" : jour} ${dateCourte(ajouterJours(semaine, m.jour - 1))} à ${heure}` : `${jour} à ${heure}`;
}

/** Où en est la semaine du rapport, à un instant donné (jour AAAA-MM-JJ et minutes depuis minuit, heure locale). */
export type EtapeRapport = "en_preparation" | "pret" | "rappel" | "en_retard";

export function etapeRapport(h: Horaires, semaine: string, maintenant: { jour: string; minutes: number }): EtapeRapport {
  const instant = (m: Moment) => `${ajouterJours(semaine, m.jour - 1)} ${String(Number(m.heure.slice(0, 2)) * 60 + Number(m.heure.slice(3, 5))).padStart(4, "0")}`;
  const now = `${maintenant.jour} ${String(maintenant.minutes).padStart(4, "0")}`;
  if (h.limite && now >= instant(h.limite)) return "en_retard";
  if (h.rappel && now >= instant(h.rappel)) return "rappel";
  if (now >= instant(h.pret)) return "pret";
  return "en_preparation";
}
