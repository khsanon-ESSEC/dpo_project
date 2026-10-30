/**
 * Charge de travail : combien d'heures de tâches chaque personne a devant elle, semaine par semaine,
 * comparé à ses heures disponibles. Calcul pur, sans base de données : facile à tester et à relire.
 *
 * Règles :
 * - seules les tâches ouvertes comptent (à faire, en cours). Les tâches bloquées sont comptées à part :
 *   elles attendent quelqu'un d'autre et n'occupent pas la personne tant qu'elles le restent ;
 * - une tâche sans estimation compte pour ESTIMATION_PAR_DEFAUT heures, et elle est signalée ;
 * - les heures sont réparties à parts égales sur les jours ouvrés (lundi à vendredi) entre le début
 *   et l'échéance. Sans début, la tâche commence assez tôt pour tenir à HEURES_PAR_JOUR heures par jour ;
 * - rien n'est placé dans le passé : une tâche commencée continue à partir d'aujourd'hui, et une
 *   tâche en retard est à rattraper aujourd'hui ;
 * - cette semaine, les heures disponibles sont celles des jours ouvrés qui restent ;
 * - une tâche sans aucune date n'entre dans aucune semaine : elle est comptée à part ;
 * - les jours d'absence (congé, formation, mission) ne comptent pas dans les heures disponibles, et les tâches
 *   n'y sont pas placées : leurs heures vont sur les autres jours ouvrés (29 octobre 2026).
 */
import { absentLe, type Plage } from "./absences";
import { ajouterJours, ecartJours, lundiDe } from "./dates";

export const ESTIMATION_PAR_DEFAUT = 4;
export const HEURES_PAR_JOUR = 8;
export const CAPACITE_PAR_DEFAUT = 40;

export type StatutTache = "a_faire" | "en_cours" | "bloquee" | "faite";

export type TacheCharge = {
  id: string;
  assigneId: string;
  statut: StatutTache;
  debut: string | null;
  echeance: string | null;
  estimationHeures: number | null;
};

export type Niveau = "libre" | "normale" | "chargee" | "surchargee";

export const LIBELLE_NIVEAU: Record<Niveau, string> = {
  libre: "Libre",
  normale: "Normale",
  chargee: "Chargée",
  surchargee: "Surchargée",
};

/** Au-delà de 85 % des heures disponibles : chargée ; au-delà de 100 % : surchargée. */
export function niveauCharge(heures: number, capacite: number): Niveau {
  if (heures <= 0) return "libre";
  if (capacite <= 0) return "surchargee";
  const taux = heures / capacite;
  if (taux > 1) return "surchargee";
  if (taux > 0.85) return "chargee";
  return "normale";
}

export function estJourOuvre(iso: string): boolean {
  const j = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return j !== 0 && j !== 6;
}

/** Jours ouvrés de debut à fin, bornes comprises. */
export function joursOuvres(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) if (estJourOuvre(d)) jours.push(d);
  return jours;
}

function prochainJourOuvre(iso: string): string {
  let d = iso;
  while (!estJourOuvre(d)) d = ajouterJours(d, 1);
  return d;
}

/** Recule de n jours ouvrés (n = 0 : le jour lui-même, ou le jour ouvré précédent). */
function reculerJoursOuvres(iso: string, n: number): string {
  let d = iso;
  while (!estJourOuvre(d)) d = ajouterJours(d, -1);
  for (let i = 0; i < n; i++) {
    d = ajouterJours(d, -1);
    while (!estJourOuvre(d)) d = ajouterJours(d, -1);
  }
  return d;
}

export const heuresDe = (t: Pick<TacheCharge, "estimationHeures">) => (t.estimationHeures && t.estimationHeures > 0 ? t.estimationHeures : ESTIMATION_PAR_DEFAUT);

/** Début prévu d'une tâche, pour le Gantt : début saisi, sinon déduit de l'échéance et de l'estimation. */
export function debutPrevu(t: Pick<TacheCharge, "debut" | "echeance" | "estimationHeures">): string | null {
  if (t.debut) return t.debut;
  if (!t.echeance) return null;
  return reculerJoursOuvres(t.echeance, Math.max(1, Math.ceil(heuresDe(t) / HEURES_PAR_JOUR)) - 1);
}

/** Prochain jour ouvré où la personne est là (au plus un an plus loin). */
function prochainJourPresent(iso: string, absences: Plage[]): string {
  let d = prochainJourOuvre(iso);
  for (let i = 0; i < 366 && absentLe(absences, d); i++) d = prochainJourOuvre(ajouterJours(d, 1));
  return d;
}

/**
 * Heures d'une tâche ouverte, jour ouvré par jour ouvré, à partir d'aujourd'hui. Les jours d'absence sont
 * sautés ; une tâche dont toute la période tombe pendant une absence se fait le dernier jour de présence
 * avant (à partir d'aujourd'hui), sinon le premier après.
 */
export function repartition(t: TacheCharge, jour: string, absences: Plage[] = []): { jour: string; heures: number }[] {
  if (t.statut === "faite" || t.statut === "bloquee") return [];
  const debut0 = debutPrevu(t);
  if (!debut0) return [];
  const h = heuresDe(t);
  const fin0 = t.echeance ?? debut0;
  // En retard : tout est à rattraper au premier jour ouvré (où la personne est là).
  if (fin0 < jour) return [{ jour: prochainJourPresent(jour, absences), heures: h }];
  const debut = debut0 < jour ? jour : debut0;
  let jours = joursOuvres(debut, fin0 < debut ? debut : fin0);
  if (!jours.length) jours = [prochainJourOuvre(debut)];
  if (absences.length) {
    const presents = jours.filter((d) => !absentLe(absences, d));
    if (presents.length) jours = presents;
    else {
      let avant = reculerJoursOuvres(ajouterJours(jours[0], -1), 0);
      while (avant >= jour && absentLe(absences, avant)) avant = reculerJoursOuvres(ajouterJours(avant, -1), 0);
      jours = [avant >= jour ? avant : prochainJourPresent(jours[jours.length - 1], absences)];
    }
  }
  return jours.map((d) => ({ jour: d, heures: h / jours.length }));
}

export type ChargeSemaine = {
  semaine: string;
  heures: number;
  capacite: number;
  niveau: Niveau;
  /** Heures de réunion notées sur les jours comptés (déjà retirées de la capacité). */
  reunions: number;
  /** Jours ouvrés d'absence parmi les jours comptés (déjà retirés de la capacité). */
  absence: number;
  /** Jours ouvrés comptés : 5, ou ceux qui restent cette semaine. */
  jours: number;
  /** Heures de chaque tâche dans cette semaine. */
  taches: { id: string; heures: number }[];
};

export type ChargePersonne = {
  semaines: ChargeSemaine[];
  ouvertes: number;
  bloquees: number;
  sansDate: number;
  sansEstimation: number;
  enRetard: number;
};

/**
 * Charge d'une personne sur les semaines demandées (lundis AAAA-MM-JJ, la première étant
 * en général la semaine en cours). Les réunions notées (passées ou prévues) réduisent le temps
 * disponible pour les tâches : cette semaine, celles des jours qui restent ; ensuite, toutes.
 * Les jours d'absence aussi : ils ne comptent pas, et une réunion notée un jour d'absence non plus.
 */
export function chargeDUnePersonne(
  taches: TacheCharge[],
  semaines: string[],
  capacite: number,
  jour: string,
  reunions: { jour: string; heures: number }[] = [],
  absences: Plage[] = [],
): ChargePersonne {
  const ouvertes = taches.filter((t) => t.statut !== "faite");
  const parSemaine = new Map(semaines.map((s) => [s, new Map<string, number>()]));
  for (const t of ouvertes) {
    for (const r of repartition(t, jour, absences)) {
      const s = parSemaine.get(lundiDe(r.jour));
      if (s) s.set(t.id, (s.get(t.id) ?? 0) + r.heures);
    }
  }
  const lundiCourant = lundiDe(jour);
  return {
    semaines: semaines.map((semaine) => {
      const m = parSemaine.get(semaine)!;
      const heures = arrondir([...m.values()].reduce((x, y) => x + y, 0));
      // Cette semaine : seulement les jours ouvrés qui restent (aujourd'hui compris).
      const comptes = semaine === lundiCourant ? joursOuvres(jour, ajouterJours(semaine, 4)) : semaine < lundiCourant ? [] : joursOuvres(semaine, ajouterJours(semaine, 4));
      const presents = comptes.filter((d) => !absentLe(absences, d));
      const brute = arrondir((capacite * presents.length) / 5);
      const enReunion = arrondir(
        reunions.filter((r) => lundiDe(r.jour) === semaine && r.jour >= jour && estJourOuvre(r.jour) && !absentLe(absences, r.jour)).reduce((x, r) => x + r.heures, 0),
      );
      const cap = arrondir(Math.max(0, brute - enReunion));
      return {
        semaine,
        heures,
        capacite: cap,
        niveau: niveauCharge(heures, cap),
        reunions: Math.min(enReunion, brute),
        absence: comptes.length - presents.length,
        jours: comptes.length,
        taches: [...m.entries()].map(([id, h]) => ({ id, heures: arrondir(h) })).sort((x, y) => y.heures - x.heures),
      };
    }),
    ouvertes: ouvertes.filter((t) => t.statut !== "bloquee").length,
    bloquees: ouvertes.filter((t) => t.statut === "bloquee").length,
    sansDate: ouvertes.filter((t) => t.statut !== "bloquee" && !t.debut && !t.echeance).length,
    sansEstimation: ouvertes.filter((t) => t.statut !== "bloquee" && !(t.estimationHeures && t.estimationHeures > 0)).length,
    enRetard: ouvertes.filter((t) => t.statut !== "bloquee" && t.echeance !== null && t.echeance < jour).length,
  };
}

/** Les n semaines à partir de celle qui contient `jour`. */
export function semainesAVenir(jour: string, n: number): string[] {
  const lundi = lundiDe(jour);
  return Array.from({ length: n }, (_, i) => ajouterJours(lundi, 7 * i));
}

export function arrondir(h: number): number {
  return Math.round(h * 10) / 10;
}

/** « 7,5 » */
export function nombre(h: number): string {
  return String(arrondir(h)).replace(".", ",");
}

/** « 7,5 h » */
export function heuresTexte(h: number): string {
  return `${nombre(h)} h`;
}

/** Utile au Gantt : nombre de jours entre deux dates, bornes comprises. */
export function dureeJours(debut: string, fin: string): number {
  return ecartJours(debut, fin) + 1;
}

/**
 * Charge réalisée : les heures d'une tâche terminée, réparties à parts égales sur les jours ouvrés de son début à
 * sa fin. Sans début saisi (ou un début après la fin), elle a commencé assez tôt pour tenir à HEURES_PAR_JOUR
 * heures par jour, comme pour la charge à venir. Une estimation de la tâche, pas un relevé du temps passé.
 */
export function repartitionRealisee(t: { debut: string | null; termineeLe: string; estimationHeures: number | null }): { jour: string; heures: number }[] {
  const h = heuresDe(t);
  const fin = reculerJoursOuvres(t.termineeLe, 0);
  const debut = t.debut && t.debut <= t.termineeLe ? t.debut : reculerJoursOuvres(fin, Math.max(1, Math.ceil(h / HEURES_PAR_JOUR)) - 1);
  let jours = joursOuvres(debut, fin);
  if (!jours.length) jours = [fin];
  return jours.map((d) => ({ jour: d, heures: h / jours.length }));
}
