/**
 * Ajouter une tâche en une ligne : « Relire maquettes UR vendredi 2h ».
 * On reconnaît le code d'un projet écrit en majuscules (UR), une échéance (aujourd'hui, demain, après-demain, un jour de la
 * semaine, « lundi prochain », « semaine prochaine », « fin du mois », 12/11, 12 novembre, « le 12 ») et une
 * estimation (2h). Le reste est le titre. Pur (sans base) : sert à l'aperçu dans la page et, à nouveau, au
 * serveur, qui ne fait jamais confiance à l'aperçu. Testé dans tests/saisie-rapide.test.ts.
 */
import { ajouterJours, jourComplet, lundiDe, premierDuMois } from "@/lib/dates";
import { lireDuree } from "@/lib/risques";
import { LIBELLE_PRIORITE, type Priorite } from "@/lib/suivi";

export type ProjetSaisie = { id: string; code: string; titre: string };
export type Morceau = { type: "projet" | "echeance" | "heures" | "priorite"; texte: string };
export type Analyse = { titre: string; projet: ProjetSaisie | null; echeance: string | null; heures: number | null; priorite: Priorite | null; morceaux: Morceau[] };

// Limites de mot qui tiennent compte des lettres accentuées (\b ne les connaît pas).
const D = "(?<=^|[\\s(])";
const F = "(?=$|[\\s),.;:!?])";
const LIEN = "(?:(?:pour|avant|d'ici|d’ici|au plus tard|le)\\s+)?";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MOIS: [RegExp, number][] = [
  [/^janv/, 1], [/^f[ée]v/, 2], [/^mars/, 3], [/^avr/, 4], [/^mai/, 5], [/^juin/, 6],
  [/^juil/, 7], [/^ao[uû]/, 8], [/^sept/, 9], [/^oct/, 10], [/^nov/, 11], [/^d[ée]c/, 12],
];
const NOMS_MOIS = "janv(?:ier)?|f[ée]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?";

/** Date valide AAAA-MM-JJ, ou null (31 février…). */
function dateValide(a: number, m: number, j: number): string | null {
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  return d.toISOString().slice(0, 10);
}

/** Jour et mois sans année : cette année, ou l'an prochain si la date est passée. */
function prochaineDate(jour: number, mois: number, aujourdhui: string): string | null {
  const an = Number(aujourdhui.slice(0, 4));
  const d = dateValide(an, mois, jour);
  if (d && d >= aujourdhui) return d;
  return dateValide(an + 1, mois, jour);
}

type Regle = { motif: RegExp; date: (m: RegExpExecArray, aujourdhui: string) => string | null };

const REGLES: Regle[] = [
  { motif: new RegExp(`${D}${LIEN}apr[eè]s[- ]demain${F}`, "i"), date: (_, t) => ajouterJours(t, 2) },
  { motif: new RegExp(`${D}${LIEN}(?:aujourd['’]?hui|ce soir)${F}`, "i"), date: (_, t) => t },
  { motif: new RegExp(`${D}${LIEN}demain${F}`, "i"), date: (_, t) => ajouterJours(t, 1) },
  {
    motif: new RegExp(`${D}${LIEN}(${JOURS.join("|")})(\\s+prochain)?${F}`, "i"),
    date: (m, t) => {
      const cible = JOURS.indexOf(m[1].toLowerCase());
      if (m[2]) return ajouterJours(lundiDe(t), 7 + cible); // « lundi prochain » : celui de la semaine suivante
      const auj = JOURS.indexOf(JOURS[(new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7]);
      return ajouterJours(t, (cible - auj + 7) % 7); // le prochain, aujourd'hui compris
    },
  },
  { motif: new RegExp(`${D}${LIEN}(?:la\\s+)?semaine\\s+prochaine${F}`, "i"), date: (_, t) => ajouterJours(lundiDe(t), 11) }, // vendredi suivant
  { motif: new RegExp(`${D}${LIEN}(?:la\\s+)?fin\\s+d[ue]\\s+mois${F}`, "i"), date: (_, t) => ajouterJours(premierDuMois(t, 1), -1) },
  {
    motif: new RegExp(`${D}${LIEN}(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2}|\\d{4}))?${F}`, "i"),
    date: (m, t) => {
      const [j, mo] = [Number(m[1]), Number(m[2])];
      if (!m[3]) return prochaineDate(j, mo, t);
      const an = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return dateValide(an, mo, j);
    },
  },
  {
    motif: new RegExp(`${D}${LIEN}(1er|\\d{1,2})\\s+(${NOMS_MOIS})\\.?(?:\\s+(\\d{4}))?${F}`, "i"),
    date: (m, t) => {
      const j = m[1].toLowerCase() === "1er" ? 1 : Number(m[1]);
      const mo = MOIS.find(([r]) => r.test(m[2].toLowerCase()))?.[1];
      if (!mo) return null;
      return m[3] ? dateValide(Number(m[3]), mo, j) : prochaineDate(j, mo, t);
    },
  },
  {
    motif: new RegExp(`${D}le\\s+(1er|\\d{1,2})${F}`, "i"),
    date: (m, t) => {
      const j = m[1].toLowerCase() === "1er" ? 1 : Number(m[1]);
      const ce = dateValide(Number(t.slice(0, 4)), Number(t.slice(5, 7)), j);
      if (ce && ce >= t) return ce;
      const suivant = premierDuMois(t, 1);
      return dateValide(Number(suivant.slice(0, 4)), Number(suivant.slice(5, 7)), j);
    },
  },
];

const HEURES = new RegExp(`${D}(?:en\\s+|environ\\s+|~)?(\\d{1,3})\\s?h(?:eures?)?${F}`, "i");

/** Retire un passage reconnu du texte (remplacé par une espace). */
function sans(texte: string, m: RegExpExecArray): string {
  return `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}`;
}

/** Première échéance reconnue dans le texte : la date et le texte sans elle. */
export function extraireEcheance(texte: string, aujourdhui: string): { echeance: string | null; reste: string } {
  for (const r of REGLES) {
    const m = r.motif.exec(texte);
    const d = m ? r.date(m, aujourdhui) : null;
    if (m && d) return { echeance: d, reste: sans(texte, m) };
  }
  return { echeance: null, reste: texte };
}

/** Estimation reconnue (« 2h », « 3 h », « en 4 heures », de 1 à 400 heures) et le texte sans elle. */
export function extraireHeures(texte: string): { heures: number | null; reste: string } {
  const h = HEURES.exec(texte);
  if (h && Number(h[1]) >= 1 && Number(h[1]) <= 400) return { heures: Number(h[1]), reste: sans(texte, h) };
  return { heures: null, reste: texte };
}

/** Texte restant, sans espaces doubles ni petits mots qui traînent à la fin. */
export function nettoyer(texte: string, longueur: number): string {
  return texte
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s+(?:pour|avant|le|sur|en|-|–|—|,|:))+$/i, "")
    .replace(/^[-–—,:;.]\s*/, "")
    .trim()
    .slice(0, longueur);
}

/** Le code d'un projet écrit tel quel, en majuscules (« UR »), n'importe où dans le texte, et le texte sans lui. */
export function extraireCodeProjet(texte: string, projets: ProjetSaisie[]): { projet: ProjetSaisie | null; reste: string } {
  const parCode = new Map(projets.map((p) => [p.code.toUpperCase(), p]));
  const nu = new RegExp(`${D}([A-Z0-9]{2,4})${F}`, "g");
  for (let m = nu.exec(texte); m; m = nu.exec(texte)) {
    if (/[A-Z]/.test(m[1]) && parCode.has(m[1])) return { projet: parCode.get(m[1])!, reste: sans(texte, m) };
  }
  return { projet: null, reste: texte };
}

const PRIORITE = /(?:^|[\s,;])priorit[ée]\s*[:：]?\s*(haute|normale|basse|urgente?|forte|faible)(?=$|[\s,;.!])/i;

/** « priorité haute » (ou basse, normale ; « urgente » vaut haute) et le texte sans elle. */
export function extrairePriorite(texte: string): { priorite: Priorite | null; reste: string } {
  const m = PRIORITE.exec(texte);
  if (!m) return { priorite: null, reste: texte };
  const v = m[1].toLowerCase();
  const priorite: Priorite = /haute|urgent|forte/.test(v) ? "haute" : /basse|faible/.test(v) ? "basse" : "normale";
  return { priorite, reste: `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}` };
}

export function analyserSaisie(saisie: string, aujourdhui: string, projets: ProjetSaisie[]): Analyse {
  let texte = ` ${String(saisie ?? "").replace(/\s+/g, " ").trim().slice(0, 300)} `;
  const morceaux: Morceau[] = [];

  // Projet : le code tel quel, en majuscules (« UR »). Dans la barre, « / » ouvre aussi la liste des projets.
  const c = extraireCodeProjet(texte, projets);
  const projet = c.projet;
  texte = c.reste;
  if (projet) morceaux.push({ type: "projet", texte: `${projet.code} · ${projet.titre}` });

  const e = extraireEcheance(texte, aujourdhui);
  texte = e.reste;
  if (e.echeance) morceaux.push({ type: "echeance", texte: jourComplet(e.echeance) });

  const h = extraireHeures(texte);
  texte = h.reste;
  if (h.heures) morceaux.push({ type: "heures", texte: `${h.heures} h de travail` });

  const pr = extrairePriorite(texte);
  texte = pr.reste;
  if (pr.priorite) morceaux.push({ type: "priorite", texte: `Priorité ${LIBELLE_PRIORITE[pr.priorite].toLowerCase()}` });

  return { titre: nettoyer(texte, 200), projet, echeance: e.echeance, heures: h.heures, priorite: pr.priorite, morceaux };
}

// ---------------------------------------------------------------------------
// Mettre à jour une tâche choisie avec « # » : « faite », « bloquée attente de la DTI », « en cours vendredi 3h »
// ---------------------------------------------------------------------------

export type StatutTache = "a_faire" | "en_cours" | "bloquee" | "faite";
export type MorceauMaj = { type: "statut" | "echeance" | "heures" | "note" | "relance" | "priorite" | "temps" | "repetition" | "annulation"; texte: string };
export type MiseAJour = {
  statut: StatutTache | null;
  blocage: string | null;
  echeance: string | null;
  heures: number | null;
  note: string;
  relance: string | null;
  /** Lot « tout faire depuis la barre » : priorité, temps passé, répétition, annulation. */
  priorite: Priorite | null;
  minutesPassees: number | null;
  rythme: string | null;
  arreterRepetition: boolean;
  annulation: string | null;
  morceaux: MorceauMaj[];
};

const JOURS_REP = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];

/** « répéter chaque lundi », « répéter tous les vendredis », « répéter chaque mois le 15 » (ou « le dernier jour »). */
function extraireRepetition(texte: string, aujourdhui: string): { rythme: string | null; libelle: string; reste: string } {
  const sem = /(?:^|[\s,;])r[ée]p[ée]ter\s+(?:chaque|tous\s+les)\s+(lundi|mardi|mercredi|jeudi|vendredi)s?(?=$|[\s,;.])/i.exec(texte);
  if (sem) {
    const j = JOURS_REP.indexOf(sem[1].toLowerCase()) + 1;
    return { rythme: `semaine:${j}`, libelle: `Répéter chaque ${JOURS_REP[j - 1]}`, reste: `${texte.slice(0, sem.index)} ${texte.slice(sem.index + sem[0].length)}` };
  }
  const mois = /(?:^|[\s,;])r[ée]p[ée]ter\s+(?:chaque|tous\s+les)\s+mois(?:\s+le\s+(1er|\d{1,2}|dernier(?:\s+jour)?))?(?=$|[\s,;.])/i.exec(texte);
  if (mois) {
    const v = (mois[1] ?? "").toLowerCase();
    const j = v.startsWith("dernier") ? 31 : v === "1er" ? 1 : v ? Number(v) : Math.min(28, Number(aujourdhui.slice(8, 10)));
    const valide = j === 31 || (j >= 1 && j <= 28) ? j : null;
    return {
      rythme: valide ? `mois:${valide}` : null,
      libelle: valide ? `Répéter chaque mois, ${valide === 31 ? "le dernier jour" : `le ${valide === 1 ? "1er" : valide}`}` : "Jour du mois : du 1er au 28, ou « le dernier jour »",
      reste: `${texte.slice(0, mois.index)} ${texte.slice(mois.index + mois[0].length)}`,
    };
  }
  return { rythme: null, libelle: "", reste: texte };
}

/** « passé 1h30 », « temps passé 45 min », « j'ai passé 2h » : des minutes, et le texte sans elles. */
function extraireTempsPasse(texte: string): { minutes: number | null; reste: string } {
  const m = /(?:^|[\s,;])(?:j['’]ai\s+)?(?:temps\s+)?pass[ée]e?\s*[:：]?\s*(\d{1,2}\s?h\s?\d{1,2}|\d{1,2}(?:[.,]\d{1,2})?\s?h(?:eures?)?|\d{1,4}\s?min)(?=$|[\s,;.])/i.exec(texte);
  if (!m) return { minutes: null, reste: texte };
  return { minutes: lireDuree(m[1]), reste: `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}` };
}

export const LIBELLES_STATUT: Record<StatutTache, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

// L'état s'écrit en premier : « faite », « en cours… », « bloquée… », « à faire » (un « fait » au milieu d'une
// note ne change rien). « en attente de… » vaut « bloquée », et la phrase entière dit ce qui bloque.
const ETATS: { motif: RegExp; statut: StatutTache; garder?: boolean }[] = [
  { motif: /^(?:c['’]est\s+)?(?:faite?s?|termin[ée]e?s?|finie?s?|achev[ée]e?s?|boucl[ée]e?s?)(?=$|[\s,.;:!])/i, statut: "faite" },
  { motif: /^(?:en\s+cours|commenc[ée]e?|d[ée]marr[ée]e?|reprise?)(?=$|[\s,.;:!])/i, statut: "en_cours" },
  { motif: /^(?:bloqu[ée]e?s?|bloque)(?=$|[\s,.;:!])/i, statut: "bloquee" },
  { motif: /^en\s+attente(?=$|[\s,.;:!])/i, statut: "bloquee", garder: true },
  { motif: /^(?:[àa]\s+faire|rouvrir|rouverte?|pas\s+(?:encore\s+)?commenc[ée]e?)(?=$|[\s,.;:!])/i, statut: "a_faire" },
];

export function analyserMiseAJour(saisie: string, aujourdhui: string): MiseAJour {
  let texte = String(saisie ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const morceaux: MorceauMaj[] = [];
  const rien = { statut: null, blocage: null, echeance: null, heures: null, note: "", relance: null, priorite: null, minutesPassees: null, rythme: null, arreterRepetition: false, annulation: null };
  // « relancer » (et un message facultatif) : la personne à qui la tâche est confiée est relancée ; rien d'autre ne change.
  const relance = /^relance[rz]?(?=$|[\s:,.;!–—-])[\s:,.;!–—-]*(.*)$/i.exec(texte);
  if (relance) {
    const message = nettoyer(relance[1], 300);
    morceaux.push({ type: "relance", texte: message ? `Relancer : « ${message} »` : "Relancer" });
    return { ...rien, relance: message, morceaux };
  }
  // « annuler : motif » : la tâche est annulée (comme depuis sa fiche) ; rien d'autre ne change.
  const annuler = /^annul(?:er|[ée]e?)(?=$|[\s:,.;!–—-])[\s:,.;!–—-]*(.*)$/i.exec(texte);
  if (annuler) {
    const motif = nettoyer(annuler[1], 500);
    morceaux.push({ type: "annulation", texte: motif ? `Annuler : « ${motif} »` : "Annuler : dites pourquoi après « annuler : »" });
    return { ...rien, annulation: motif, morceaux };
  }
  if (/^(?:arr[êe]ter|stopper)\s+(?:la\s+)?r[ée]p[ée]tition$|^ne\s+plus\s+r[ée]p[ée]ter$/i.test(texte)) {
    morceaux.push({ type: "repetition", texte: "Arrêter la répétition" });
    return { ...rien, arreterRepetition: true, morceaux };
  }
  // Priorité, temps passé, répétition : se combinent avec le reste (« faite, passé 1h30 »).
  const pr = extrairePriorite(` ${texte} `);
  texte = pr.reste;
  const tp = extraireTempsPasse(texte);
  texte = tp.reste;
  const rep = extraireRepetition(texte, aujourdhui);
  texte = rep.reste.replace(/\s+/g, " ").replace(/^[\s,;]+|[\s,;]+$/g, "").trim();
  const extras: MorceauMaj[] = [
    ...(pr.priorite ? [{ type: "priorite" as const, texte: `Priorité ${LIBELLE_PRIORITE[pr.priorite].toLowerCase()}` }] : []),
    ...(tp.minutes ? [{ type: "temps" as const, texte: `Temps passé : ${tp.minutes >= 60 ? `${Math.floor(tp.minutes / 60)} h${tp.minutes % 60 ? ` ${String(tp.minutes % 60).padStart(2, "0")}` : ""}` : `${tp.minutes} min`}` }] : []),
    ...(rep.libelle ? [{ type: "repetition" as const, texte: rep.libelle }] : []),
  ];
  const plus = { priorite: pr.priorite, minutesPassees: tp.minutes, rythme: rep.rythme, arreterRepetition: false, annulation: null };
  let statut: StatutTache | null = null;
  let garder = false;
  for (const e of ETATS) {
    const m = e.motif.exec(texte);
    if (m) {
      statut = e.statut;
      garder = !!e.garder;
      if (!garder) texte = texte.slice(m[0].length);
      break;
    }
  }
  // Bloquée : tout le reste dit ce qui bloque (une date ou une durée y restent telles quelles).
  if (statut === "bloquee") {
    const blocage = nettoyer(garder ? texte : texte.replace(/^[\s:,.;–—-]*(?:(?:par|car|parce\s+que|à\s+cause\s+de|:)\s+)?/i, ""), 1000) || null;
    const b = blocage ? blocage.charAt(0).toUpperCase() + blocage.slice(1) : null;
    morceaux.push({ type: "statut", texte: b ? `Bloquée : ${b}` : "Bloquée" }, ...extras);
    return { statut, blocage: b, echeance: null, heures: null, note: "", relance: null, ...plus, morceaux };
  }
  if (statut) morceaux.push({ type: "statut", texte: LIBELLES_STATUT[statut] });
  texte = ` ${texte} `;
  const e = extraireEcheance(texte, aujourdhui);
  texte = e.reste;
  if (e.echeance) morceaux.push({ type: "echeance", texte: `Échéance : ${jourComplet(e.echeance)}` });
  const h = extraireHeures(texte);
  texte = h.reste;
  if (h.heures) morceaux.push({ type: "heures", texte: `${h.heures} h de travail` });
  const note = nettoyer(texte, 500);
  morceaux.push(...extras);
  if (note) morceaux.push({ type: "note", texte: `Note : ${note}` });
  return { statut, blocage: null, echeance: e.echeance, heures: h.heures, note, relance: null, ...plus, morceaux };
}

// ---------------------------------------------------------------------------
// Noter une réunion : « Réunion comité de pilotage /unib @fab jeudi 10h 1h30 »
// ---------------------------------------------------------------------------

export type MorceauReunion = { type: "projet" | "jour" | "heure" | "duree"; texte: string };
export type AnalyseReunion = { titre: string; projet: ProjetSaisie | null; jour: string; heure: string | null; dureeMinutes: number; morceaux: MorceauReunion[] };

/** La ligne commence par « réunion » (ou « réu », « rdv ») : c'est une réunion à noter, pas une tâche. */
export const DEBUT_REUNION = /^\s*(?:r[ée]union|r[ée]u|rdv|rendez-vous)(?=$|[\s:,–—-])[\s:,–—-]*/i;
export const estReunion = (saisie: string) => DEBUT_REUNION.test(saisie);

export const DUREE_PAR_DEFAUT = 60;

/** « 1 h 30 », « 45 min ». */
export function texteDuree(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

// Le jour d'une réunion se dit le plus souvent dans la semaine en cours, passée ou à venir (on note aussi ce
// qui a eu lieu) : « lundi » = le lundi de cette semaine ; « lundi prochain » / « lundi dernier ».
const REGLES_JOUR: Regle[] = [
  { motif: new RegExp(`${D}(?:le\\s+)?avant[- ]hier${F}`, "i"), date: (_, t) => ajouterJours(t, -2) },
  { motif: new RegExp(`${D}(?:le\\s+)?apr[eè]s[- ]demain${F}`, "i"), date: (_, t) => ajouterJours(t, 2) },
  { motif: new RegExp(`${D}hier${F}`, "i"), date: (_, t) => ajouterJours(t, -1) },
  { motif: new RegExp(`${D}(?:aujourd['’]?hui|ce\\s+matin|cet\\s+apr[eè]s-midi|ce\\s+soir)${F}`, "i"), date: (_, t) => t },
  { motif: new RegExp(`${D}demain${F}`, "i"), date: (_, t) => ajouterJours(t, 1) },
  {
    motif: new RegExp(`${D}(?:le\\s+|ce\\s+)?(${JOURS.join("|")})(\\s+(?:prochain|dernier))?${F}`, "i"),
    date: (m, t) => {
      const cible = JOURS.indexOf(m[1].toLowerCase());
      const decalage = !m[2] ? 0 : /prochain/i.test(m[2]) ? 7 : -7;
      return ajouterJours(lundiDe(t), cible + decalage);
    },
  },
  {
    motif: new RegExp(`${D}(?:le\\s+)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2}|\\d{4}))?${F}`, "i"),
    date: (m, t) => dateValide(m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(t.slice(0, 4)), Number(m[2]), Number(m[1])),
  },
  {
    motif: new RegExp(`${D}(?:le\\s+)?(1er|\\d{1,2})\\s+(${NOMS_MOIS})\\.?(?:\\s+(\\d{4}))?${F}`, "i"),
    date: (m, t) => {
      const mo = MOIS.find(([r]) => r.test(m[2].toLowerCase()))?.[1];
      return mo ? dateValide(m[3] ? Number(m[3]) : Number(t.slice(0, 4)), mo, m[1].toLowerCase() === "1er" ? 1 : Number(m[1])) : null;
    },
  },
  { motif: new RegExp(`${D}le\\s+(1er|\\d{1,2})${F}`, "i"), date: (m, t) => dateValide(Number(t.slice(0, 4)), Number(t.slice(5, 7)), m[1].toLowerCase() === "1er" ? 1 : Number(m[1])) },
];

const hhmm = (h: number, m: number) => (h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null);

export function analyserReunion(saisie: string, aujourdhui: string, projets: ProjetSaisie[]): AnalyseReunion {
  let texte = ` ${String(saisie ?? "").replace(DEBUT_REUNION, "").replace(/\s+/g, " ").trim().slice(0, 300)} `;
  const morceaux: MorceauReunion[] = [];

  let projet: ProjetSaisie | null = null;
  const parCode = new Map(projets.map((p) => [p.code.toUpperCase(), p]));
  const nu = new RegExp(`${D}([A-Z0-9]{2,4})${F}`, "g");
  for (let m = nu.exec(texte); m; m = nu.exec(texte)) {
    if (/[A-Z]/.test(m[1]) && parCode.has(m[1])) {
      projet = parCode.get(m[1])!;
      texte = sans(texte, m);
      break;
    }
  }
  if (projet) morceaux.push({ type: "projet", texte: `${projet.code} · ${projet.titre}` });

  // Heure et durée : « de 10h à 11h30 », « à 14h », « 10h 1h30 », « 45 min », « pendant 2h ».
  let heure: string | null = null;
  let duree: number | null = null;
  const plage = new RegExp(`${D}de\\s+(\\d{1,2})\\s?h\\s?(\\d{2})?\\s+[àa]\\s+(\\d{1,2})\\s?h\\s?(\\d{2})?${F}`, "i").exec(texte);
  if (plage) {
    const debut = Number(plage[1]) * 60 + Number(plage[2] ?? 0);
    const fin = Number(plage[3]) * 60 + Number(plage[4] ?? 0);
    heure = hhmm(Number(plage[1]), Number(plage[2] ?? 0));
    if (heure && fin > debut) duree = fin - debut;
    texte = sans(texte, plage);
  }
  const minutesSeules = new RegExp(`${D}(?:pendant\\s+|dur[ée]e\\s*:?\\s*)?(\\d{1,3})\\s?min(?:utes?)?${F}`, "i").exec(texte);
  if (minutesSeules && duree === null) {
    duree = Number(minutesSeules[1]);
    texte = sans(texte, minutesSeules);
  }
  const enHeures = (marque: RegExp) => marque.exec(texte);
  const aHeure = enHeures(new RegExp(`${D}(?:[àa]|vers)\\s+(\\d{1,2})\\s?h\\s?(\\d{2})?${F}`, "i"));
  if (aHeure && !heure) {
    heure = hhmm(Number(aHeure[1]), Number(aHeure[2] ?? 0));
    texte = sans(texte, aHeure);
  }
  const pendant = enHeures(new RegExp(`${D}(?:pendant|dur[ée]e\\s*:?)\\s+(\\d{1,2})\\s?h\\s?(\\d{2})?${F}`, "i"));
  if (pendant && duree === null) {
    duree = Number(pendant[1]) * 60 + Number(pendant[2] ?? 0);
    texte = sans(texte, pendant);
  }
  // Ce qui reste (« 10h », « 1h30 ») : à partir de 7 h, c'est l'heure ; en dessous, la durée.
  for (let i = 0; i < 2; i++) {
    const m = new RegExp(`${D}(\\d{1,2})\\s?h\\s?(\\d{2})?${F}`, "i").exec(texte);
    if (!m) break;
    const h = Number(m[1]);
    const mn = Number(m[2] ?? 0);
    if (!heure && h >= 7) heure = hhmm(h, mn);
    else if (duree === null) duree = h * 60 + mn;
    else break;
    texte = sans(texte, m);
  }

  // Jour : aujourd'hui sauf mention.
  let jour = aujourdhui;
  for (const r of REGLES_JOUR) {
    const m = r.motif.exec(texte);
    const d = m ? r.date(m, aujourdhui) : null;
    if (m && d) {
      jour = d;
      texte = sans(texte, m);
      break;
    }
  }
  morceaux.push({ type: "jour", texte: jourComplet(jour) });
  if (heure) morceaux.push({ type: "heure", texte: `à ${heure.replace(":", " h ").replace(" h 00", " h")}` });
  const dureeMinutes = duree !== null && duree >= 5 && duree <= 600 ? duree : DUREE_PAR_DEFAUT;
  morceaux.push({ type: "duree", texte: texteDuree(dureeMinutes) });
  // « Réunion comité de pilotage » : le titre est « Comité de pilotage ».
  const titre = nettoyer(texte, 160);
  return { titre: titre.charAt(0).toUpperCase() + titre.slice(1), projet, jour, heure, dureeMinutes, morceaux };
}
