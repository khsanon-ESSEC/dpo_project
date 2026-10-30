/**
 * Bilan d'activité : ce que l'application a enregistré sur une période (tâches marquées faites,
 * réunions notées, rapports envoyés). Règles pures, testées dans tests/bilan.test.ts.
 *
 * Ces chiffres décrivent l'activité enregistrée, pas la qualité du travail ni tout ce qui a été fait :
 * ils servent à une conversation, pas à un classement.
 */
import { joursOuvresAbsents, type Plage } from "./absences";
import { ajouterJours, lundiDe, premierDuMois } from "./dates";
import { arrondir, ESTIMATION_PAR_DEFAUT, joursOuvres } from "./charge";

export type Periode = { cle: string; debut: string; fin: string };

export type TacheTerminee = { estimationHeures: number | null; echeance: string | null; termineeLe: string };

export type Mesures = {
  /** Tâches marquées faites dans la période. */
  taches: number;
  /** Heures estimées de ces tâches (4 h pour une tâche sans estimation). */
  heures: number;
  /** Part des tâches à échéance terminées à temps, en % ; null s'il n'y en a pas. */
  aLHeure: number | null;
  avecEcheance: number;
  minutesReunion: number;
  /** Heures de travail de la période (capacité de la semaine × jours ouvrés comptés / 5). */
  capaciteHeures: number;
  /** Part du temps de travail passée en réunion, en % ; null si la période n'a pas de jour ouvré. */
  partReunion: number | null;
  rapportsEnvoyes: number;
  rapportsAttendus: number;
  /** Charge réalisée : heures des tâches terminées, réparties de leur début à leur fin, tombées dans la période. */
  heuresRealisees: number;
  /** Heures disponibles pour les tâches : heures de travail moins les réunions. */
  capaciteNette: number;
  /** Charge réalisée en % des heures disponibles ; null si aucune heure disponible. */
  tauxCharge: number | null;
  /** Charge prévue, notée chaque lundi (semaines de la période où elle l'a été). */
  prevuHeures: number;
  prevuCapacite: number;
  /** Charge prévue en % ; null si rien n'a été noté sur la période. */
  tauxPrevu: number | null;
};

export type ChargePrevue = { semaine: string; heures: number; capacite: number };

/** Mesures d'une personne sur une période. `jusqua` borne les jours comptés (aujourd'hui, pour la période en cours). */
export function mesurer(
  p: Periode,
  d: {
    terminees: TacheTerminee[];
    minutesReunion: number;
    capaciteHebdo: number;
    rapportsEnvoyes: number;
    rapportsAttendus: number;
    /** Heures réalisées, jour par jour (repartitionRealisee de chaque tâche terminée). */
    reparties?: { jour: string; heures: number }[];
    /** Charges prévues notées chaque lundi. */
    prevues?: ChargePrevue[];
    /** Absences : leurs jours ouvrés ne comptent pas dans les heures de travail. */
    absences?: Plage[];
  },
  jusqua: string,
): Mesures {
  const dans = d.terminees.filter((t) => t.termineeLe >= p.debut && t.termineeLe <= p.fin);
  const avecEcheance = dans.filter((t) => t.echeance);
  const aTemps = avecEcheance.filter((t) => t.termineeLe <= t.echeance!).length;
  const fin = p.fin < jusqua ? p.fin : jusqua;
  const jours = fin < p.debut ? 0 : joursOuvres(p.debut, fin).length - joursOuvresAbsents(d.absences ?? [], p.debut, fin);
  const capaciteHeures = arrondir((d.capaciteHebdo * jours) / 5);
  const heuresRealisees = arrondir((d.reparties ?? []).filter((r) => r.jour >= p.debut && r.jour <= fin).reduce((s, r) => s + r.heures, 0));
  const capaciteNette = arrondir(Math.max(0, capaciteHeures - d.minutesReunion / 60));
  const prevues = (d.prevues ?? []).filter((x) => x.semaine >= p.debut && x.semaine <= fin);
  const prevuHeures = arrondir(prevues.reduce((s, x) => s + x.heures, 0));
  const prevuCapacite = arrondir(prevues.reduce((s, x) => s + x.capacite, 0));
  return {
    taches: dans.length,
    heures: arrondir(dans.reduce((s, t) => s + (t.estimationHeures && t.estimationHeures > 0 ? t.estimationHeures : ESTIMATION_PAR_DEFAUT), 0)),
    aLHeure: avecEcheance.length ? Math.round((aTemps / avecEcheance.length) * 100) : null,
    avecEcheance: avecEcheance.length,
    minutesReunion: d.minutesReunion,
    capaciteHeures,
    partReunion: capaciteHeures > 0 ? Math.round((d.minutesReunion / 60 / capaciteHeures) * 100) : null,
    rapportsEnvoyes: d.rapportsEnvoyes,
    rapportsAttendus: d.rapportsAttendus,
    heuresRealisees,
    capaciteNette,
    tauxCharge: capaciteNette > 0 ? Math.round((heuresRealisees / capaciteNette) * 100) : null,
    prevuHeures,
    prevuCapacite,
    tauxPrevu: prevues.length && prevuCapacite > 0 ? Math.round((prevuHeures / prevuCapacite) * 100) : null,
  };
}

/** Additionne les mesures de plusieurs personnes (total d'une équipe). */
export function additionner(liste: Mesures[]): Mesures {
  const s = (f: (m: Mesures) => number) => liste.reduce((t, m) => t + f(m), 0);
  const avecEcheance = s((m) => m.avecEcheance);
  const aTemps = liste.reduce((t, m) => t + (m.aLHeure !== null ? (m.aLHeure / 100) * m.avecEcheance : 0), 0);
  const capaciteHeures = arrondir(s((m) => m.capaciteHeures));
  const minutesReunion = s((m) => m.minutesReunion);
  return {
    taches: s((m) => m.taches),
    heures: arrondir(s((m) => m.heures)),
    aLHeure: avecEcheance ? Math.round((aTemps / avecEcheance) * 100) : null,
    avecEcheance,
    minutesReunion,
    capaciteHeures,
    partReunion: capaciteHeures > 0 ? Math.round((minutesReunion / 60 / capaciteHeures) * 100) : null,
    rapportsEnvoyes: s((m) => m.rapportsEnvoyes),
    rapportsAttendus: s((m) => m.rapportsAttendus),
    heuresRealisees: arrondir(s((m) => m.heuresRealisees)),
    capaciteNette: arrondir(s((m) => m.capaciteNette)),
    tauxCharge: s((m) => m.capaciteNette) > 0 ? Math.round((s((m) => m.heuresRealisees) / s((m) => m.capaciteNette)) * 100) : null,
    prevuHeures: arrondir(s((m) => m.prevuHeures)),
    prevuCapacite: arrondir(s((m) => m.prevuCapacite)),
    tauxPrevu: liste.some((m) => m.tauxPrevu !== null) && s((m) => m.prevuCapacite) > 0 ? Math.round((s((m) => m.prevuHeures) / s((m) => m.prevuCapacite)) * 100) : null,
  };
}

/** Écart entre deux valeurs : « +3 », « −2 », « = » ; null si l'une manque. */
export function ecart(actuel: number | null, avant: number | null, unite = ""): string | null {
  if (actuel === null || avant === null) return null;
  const d = arrondir(actuel - avant);
  if (d === 0) return "=";
  return `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")}${unite}`;
}

/** Les n semaines qui finissent par celle du jour donné (la plus ancienne d'abord). */
export function semainesJusqua(jour: string, n: number): Periode[] {
  const lundi = lundiDe(jour);
  return Array.from({ length: n }, (_, i) => {
    const debut = ajouterJours(lundi, -7 * (n - 1 - i));
    return { cle: debut, debut, fin: ajouterJours(debut, 6) };
  });
}

/** Un mois « AAAA-MM » : du 1er au dernier jour. */
export function mois(cle: string): Periode {
  const debut = `${cle}-01`;
  return { cle, debut, fin: ajouterJours(premierDuMois(debut, 1), -1) };
}

/** Le mois d'après « AAAA-MM ». */
export function moisSuivant(cle: string): string {
  return premierDuMois(`${cle}-01`, 1).slice(0, 7);
}

/** Le mois d'avant « AAAA-MM ». */
export function moisPrecedent(cle: string): string {
  return premierDuMois(`${cle}-01`, -1).slice(0, 7);
}

/** Lundis des semaines dont le rapport est attendu dans la période : semaines commencées, et pas celle en cours avant vendredi. */
export function semainesDeRapport(p: Periode, jour: string): string[] {
  const lundis: string[] = [];
  for (let l = lundiDe(p.debut) < p.debut ? ajouterJours(lundiDe(p.debut), 7) : lundiDe(p.debut); l <= p.fin; l = ajouterJours(l, 7)) {
    // Le rapport d'une semaine est attendu à partir de son vendredi.
    if (ajouterJours(l, 4) <= jour) lundis.push(l);
  }
  return lundis;
}

// ---------------------------------------------------------------------------
// Périodes du bilan d'équipe : un mois, les 3 ou 6 derniers mois, un exercice
// ---------------------------------------------------------------------------

export type VueBilan = "semaine" | "mois" | "3m" | "6m" | "exercice";
/** Les périodes proposées partout où l'application montre de l'activité : le même sélecteur sur chaque page. */
export const VUES_BILAN: { id: VueBilan; libelle: string }[] = [
  { id: "semaine", libelle: "Semaine" },
  { id: "mois", libelle: "Mois" },
  { id: "3m", libelle: "3 mois" },
  { id: "6m", libelle: "6 mois" },
  { id: "exercice", libelle: "Exercice" },
];

const dernierDuMois = (iso: string) => ajouterJours(premierDuMois(iso, 1), -1);

/** Décale une date de n mois en gardant le jour (borné au dernier jour du mois d'arrivée). */
export function decalerMois(jour: string, n: number): string {
  const premier = premierDuMois(jour, n);
  const j = `${premier.slice(0, 8)}${jour.slice(8, 10)}`;
  const dernier = dernierDuMois(premier);
  return j > dernier ? dernier : j;
}

/** Fin de période décalée de n mois : un dernier jour de mois reste un dernier jour de mois. */
function decalerFin(fin: string, n: number): string {
  return fin === dernierDuMois(fin) ? dernierDuMois(premierDuMois(fin, n)) : decalerMois(fin, n);
}

/** Les mois « AAAA-MM » de debut à fin compris. */
export function moisEntre(debut: string, fin: string): string[] {
  const out: string[] = [];
  for (let m = premierDuMois(debut); m <= fin; m = premierDuMois(m, 1)) out.push(m.slice(0, 7));
  return out;
}

/** Mois de début de l'exercice : 1 à 12 (10, octobre, par défaut ; EXERCICE_DEBUT_MOIS). */
export function moisDebutExercice(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 10;
}

/** L'exercice qui contient ce jour, désigné par l'année où il commence. */
export function exerciceDe(jour: string, debutMois: number): number {
  const annee = Number(jour.slice(0, 4));
  return Number(jour.slice(5, 7)) >= debutMois ? annee : annee - 1;
}

/** « 2025-2026 », ou « 2026 » pour un exercice calé sur l'année civile. */
export function nomExercice(annee: number, debutMois: number): string {
  return debutMois === 1 ? String(annee) : `${annee}-${annee + 1}`;
}

export type PlanBilan = {
  vue: VueBilan;
  /** La période étudiée, arrêtée à aujourd'hui si elle est en cours. */
  actuel: Periode;
  /** La période comparée, de même durée : juste avant, ou l'an dernier pour un exercice ; arrêtée à la même date. */
  precedent: Periode;
  /** Les mois de la période (jusqu'au mois en cours), pour les courbes. */
  serie: Periode[];
  /** Les mois (ou semaines) correspondants de la période comparée, alignés sur `axe` ; null : pas de comparaison pas à pas. */
  serieAvant: Periode[] | null;
  /** Les mois portés par l'axe des courbes (un exercice en a douze, même en cours) ; les lundis pour « semaine ». */
  axe: string[];
  enCours: boolean;
  /** Paramètres pour aller à la période d'avant ou d'après (null : rien après). */
  avant: string;
  apres: string | null;
  /** Clé de la période (mois, fin de fenêtre ou année d'exercice), pour la navigation. */
  cle: string;
};

/** Une vue lue dans l'adresse ou dans la préférence gardée ; null si elle n'en est pas une. */
export function vueValide(v: string | undefined | null): VueBilan | null {
  return v === "semaine" || v === "mois" || v === "3m" || v === "6m" || v === "exercice" ? v : null;
}

/**
 * Ce que montre le bilan pour une vue et un paramètre lus dans l'adresse (vérifiés ici).
 * - semaine : la semaine choisie (un lundi), comparée à la semaine d'avant à la même date ; courbe des huit
 *   semaines qui y mènent ;
 * - mois : le mois choisi, comparé au mois d'avant à la même date ; courbe des six mois qui y mènent ;
 * - 3m / 6m : la fenêtre qui finit au mois choisi, comparée à la fenêtre d'avant, mois par mois ;
 * - exercice : l'exercice choisi, comparé au précédent à la même date ; courbes sur les douze mois.
 */
export function planBilan(vue: string | undefined, param: string | undefined, jour: string, debutExercice: number): PlanBilan {
  const moisCourant = jour.slice(0, 7);
  const borne = (fin: string) => (fin < jour ? fin : jour);
  const v: VueBilan = vueValide(vue) ?? "mois";

  if (v === "semaine") {
    const courante = lundiDe(jour);
    const lu = param && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(Date.parse(param)) ? lundiDe(param) : courante;
    const cle = lu <= courante ? lu : courante;
    const avant = ajouterJours(cle, -7);
    const fin = borne(ajouterJours(cle, 6));
    const serie = semainesJusqua(cle, 8);
    return {
      vue: v,
      actuel: { cle, debut: cle, fin },
      precedent: { cle: avant, debut: avant, fin: ajouterJours(fin, -7) },
      serie,
      serieAvant: null,
      axe: serie.map((p) => p.cle),
      enCours: cle === courante,
      avant,
      apres: cle < courante ? ajouterJours(cle, 7) : null,
      cle,
    };
  }

  if (v === "exercice") {
    const courant = exerciceDe(jour, debutExercice);
    const n = Number(param);
    const annee = Number.isInteger(n) && n >= 2000 && n <= courant ? n : courant;
    const debut = `${annee}-${String(debutExercice).padStart(2, "0")}-01`;
    const finEx = ajouterJours(premierDuMois(debut, 12), -1);
    const fin = borne(finEx);
    const axe = moisEntre(debut, finEx);
    return {
      vue: v,
      actuel: { cle: String(annee), debut, fin },
      precedent: { cle: String(annee - 1), debut: premierDuMois(debut, -12), fin: decalerFin(fin, -12) },
      serie: moisEntre(debut, fin).map(mois),
      serieAvant: axe.map((m) => mois(premierDuMois(`${m}-01`, -12).slice(0, 7))),
      axe,
      enCours: finEx >= jour,
      avant: String(annee - 1),
      apres: annee < courant ? String(annee + 1) : null,
      cle: String(annee),
    };
  }

  const valide = (p: string | undefined) => (p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) && p <= moisCourant ? p : moisCourant);
  const cle = valide(param);
  if (v === "mois") {
    const debut = `${cle}-01`;
    const fin = borne(dernierDuMois(debut));
    const axe = moisEntre(premierDuMois(debut, -5), debut);
    return {
      vue: v,
      actuel: { cle, debut, fin },
      precedent: { cle: moisPrecedent(cle), debut: premierDuMois(debut, -1), fin: decalerFin(fin, -1) },
      serie: axe.map(mois),
      serieAvant: null,
      axe,
      enCours: cle === moisCourant,
      avant: moisPrecedent(cle),
      apres: cle < moisCourant ? moisSuivant(cle) : null,
      cle,
    };
  }

  const n = v === "3m" ? 3 : 6;
  const debut = premierDuMois(`${cle}-01`, -(n - 1));
  const fin = borne(dernierDuMois(`${cle}-01`));
  const axe = moisEntre(debut, `${cle}-01`);
  const suivant = premierDuMois(`${cle}-01`, n).slice(0, 7);
  return {
    vue: v,
    actuel: { cle, debut, fin },
    precedent: { cle: premierDuMois(`${cle}-01`, -n).slice(0, 7), debut: premierDuMois(debut, -n), fin: decalerFin(fin, -n) },
    serie: axe.map(mois),
    serieAvant: axe.map((m) => mois(premierDuMois(`${m}-01`, -n).slice(0, 7))),
    axe,
    enCours: cle === moisCourant,
    avant: premierDuMois(`${cle}-01`, -n).slice(0, 7),
    apres: cle < moisCourant ? (suivant < moisCourant ? suivant : moisCourant) : null,
    cle,
  };
}

/**
 * Ce qui se compare : avant les premières données de l'application, il n'y a rien (ni zéro, ni comparaison).
 * Une période d'avant entamée par ce début ne se compare pas en totaux, seulement point par point.
 */
export function etatComparaison(plan: PlanBilan, debutDonnees: string | null) {
  const avecDonnees = (per: Periode) => !!debutDonnees && per.fin >= debutDonnees;
  const pasAvant = avecDonnees(plan.precedent);
  const partielle = pasAvant && plan.precedent.debut < debutDonnees!;
  return { avecDonnees, pasAvant, partielle, comparer: pasAvant && !partielle, deuxSeries: !!plan.serieAvant && pasAvant };
}
