/**
 * Absences et congés (demandé le 29 octobre 2026) : des journées entières, du premier au dernier jour inclus.
 * Les jours ouvrés d'absence sont retirés des heures disponibles de la charge et les tâches n'y sont pas placées
 * (src/lib/charge.ts) ; qui note une réunion apprend qu'un participant est absent ce jour-là.
 *
 * Dans la barre : « absent du 2/11 au 6/11 », « en congé la semaine prochaine », « en formation jeudi »,
 * « Myriam absente du 2 au 6 novembre », « absence de Myriam demain ». Une phrase qui garde d'autres mots
 * (« Congé de Myriam : préparer la passation vendredi ») reste une tâche. Pur (sans base) ; testé dans
 * tests/absences.test.ts.
 */
import { personneNommee, type Nomme } from "@/lib/barre";
import { ajouterJours, ecartJours, jourComplet, lundiDe } from "@/lib/dates";
import { extraireEcheance } from "@/lib/saisie-rapide";

export const MOTIFS_ABSENCE = ["conge", "formation", "mission", "absence"] as const;
export type MotifAbsence = (typeof MOTIFS_ABSENCE)[number];
export const LIBELLE_MOTIF: Record<MotifAbsence, string> = { conge: "Congé", formation: "Formation", mission: "Mission", absence: "Absence" };
export const estMotif = (m: unknown): m is MotifAbsence => typeof m === "string" && (MOTIFS_ABSENCE as readonly string[]).includes(m);

/** Une période d'absence, bornes comprises (AAAA-MM-JJ). */
export type Plage = { debut: string; fin: string };

/** Jusqu'où on peut noter une absence passée (pour corriger le bilan), et à venir. */
export const JOURS_PASSES_MAX = 60;
export const JOURS_FUTURS_MAX = 400;
export const DUREE_MAX_JOURS = 366;

const ouvre = (iso: string) => {
  const j = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return j !== 0 && j !== 6;
};

export const absentLe = (plages: Plage[], jour: string) => plages.some((p) => p.debut <= jour && jour <= p.fin);

/** Jours ouvrés d'absence entre deux dates (bornes comprises). */
export function joursOuvresAbsents(plages: Plage[], debut: string, fin: string): number {
  if (!plages.length || fin < debut) return 0;
  let n = 0;
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) if (ouvre(d) && absentLe(plages, d)) n += 1;
  return n;
}

/** Jours ouvrés d'une période. */
export function joursOuvresDe(p: Plage): number {
  let n = 0;
  for (let d = p.debut; d <= p.fin; d = ajouterJours(d, 1)) if (ouvre(d)) n += 1;
  return n;
}

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** « le lundi 2 novembre », « du lundi 2 au vendredi 6 novembre », « du lundi 30 novembre au mercredi 2 décembre ». */
export function texteAbsence(p: Plage): string {
  if (p.debut === p.fin) return `le ${minuscule(jourComplet(p.debut))}`;
  const memeMois = p.debut.slice(0, 7) === p.fin.slice(0, 7);
  const d = minuscule(jourComplet(p.debut));
  return `du ${memeMois ? d.replace(/\s+\S+$/, "") : d} au ${minuscule(jourComplet(p.fin))}`;
}

/** Ce qui ne va pas dans une période d'absence, ou null. */
export function erreurAbsence(p: Plage, aujourdhui: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(p.debut) || !iso.test(p.fin) || Number.isNaN(Date.parse(p.debut)) || Number.isNaN(Date.parse(p.fin))) return "Dates à vérifier.";
  if (p.fin < p.debut) return "Le dernier jour est avant le premier.";
  if (ecartJours(p.debut, p.fin) + 1 > DUREE_MAX_JOURS) return "Une absence dure un an au plus.";
  if (ecartJours(p.fin, aujourdhui) > JOURS_PASSES_MAX) return `Trop ancienne : on note une absence jusqu'à ${JOURS_PASSES_MAX} jours en arrière.`;
  if (ecartJours(aujourdhui, p.debut) > JOURS_FUTURS_MAX) return "Trop lointaine : notez-la plus tard.";
  if (!joursOuvresDe(p)) return "Aucun jour ouvré dans cette période : le week-end ne compte pas.";
  return null;
}

// ---------------------------------------------------------------------------
// Dans la barre
// ---------------------------------------------------------------------------

const MOT = "[\\p{L}][\\p{L}'’-]*";
const TETE = "(?:je\\s+(?:suis|serai)\\s+)?(absente?s?|absence|en\\s+cong[ée]s?|cong[ée]s?|en\\s+formation|en\\s+mission|en\\s+d[ée]placement)";

function motifDe(mot: string): MotifAbsence {
  const m = mot.toLowerCase();
  if (/cong/.test(m)) return "conge";
  if (/formation/.test(m)) return "formation";
  if (/mission|placement/.test(m)) return "mission";
  return "absence";
}

/** Une date sans année au-delà de dix mois, dont la même date l'an passé est récente : c'est l'an passé. */
function rapprocher(d: string, aujourdhui: string): string {
  if (ecartJours(aujourdhui, d) <= 300) return d;
  const avant = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  return !Number.isNaN(Date.parse(avant)) && ecartJours(avant, aujourdhui) >= 0 && ecartJours(avant, aujourdhui) <= JOURS_PASSES_MAX ? avant : d;
}

/** Une seule date, et rien d'autre : « lundi », « 12/11 », « 12 novembre », « demain », « hier ». */
function uneDate(texte: string, reference: string): string | null {
  const t = texte.replace(/^(?:le|du|au)\s+/i, "").trim();
  if (/^hier$/i.test(t)) return ajouterJours(reference, -1);
  const e = extraireEcheance(` ${t} `, reference);
  return e.echeance && !e.reste.trim() ? e.echeance : null;
}

/** La période que disent ces mots, sinon null. */
function periodeDe(texte: string, aujourdhui: string): Plage | null {
  const t = texte.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(?:toute\s+)?(?:la\s+)?semaine\s+prochaine$/i.test(t)) {
    const lundi = ajouterJours(lundiDe(aujourdhui), 7);
    return { debut: lundi, fin: ajouterJours(lundi, 4) };
  }
  if (/^(?:toute\s+)?cette\s+semaine$/i.test(t)) return { debut: aujourdhui, fin: ajouterJours(lundiDe(aujourdhui), 4) };
  // Une seule date d'abord (« après-demain » a un trait d'union, ce n'est pas une période).
  const seule = uneDate(t, aujourdhui);
  if (seule) {
    const jour = rapprocher(seule, aujourdhui);
    return { debut: jour, fin: jour };
  }
  const jusqua = /^jusqu['’](?:au|à)\s+(.+)$/i.exec(t);
  if (jusqua) {
    const fin = uneDate(jusqua[1], aujourdhui);
    return fin ? { debut: aujourdhui, fin } : null;
  }
  const entre = /^(?:du\s+)?(.+?)\s*(?:\s+au\s+|\s*[-–—]\s*)(.+)$/i.exec(t);
  if (entre) {
    const [x, y] = [entre[1].trim(), entre[2].trim()];
    const nu = /^(?:le\s+)?(1er|\d{1,2})$/i.exec(x);
    if (nu) {
      // « du 2 au 6 novembre » : le mois (et l'année) de la fin.
      const fin = uneDate(y, aujourdhui);
      if (!fin) return null;
      const j = nu[1].toLowerCase() === "1er" ? 1 : Number(nu[1]);
      let debut = `${fin.slice(0, 8)}${String(j).padStart(2, "0")}`;
      if (Number.isNaN(Date.parse(debut)) || debut.slice(5, 7) !== fin.slice(5, 7)) return null;
      if (debut > fin) {
        const m = new Date(`${fin.slice(0, 8)}01T12:00:00Z`);
        m.setUTCMonth(m.getUTCMonth() - 1);
        debut = `${m.toISOString().slice(0, 8)}${String(j).padStart(2, "0")}`;
        if (Number.isNaN(Date.parse(debut))) return null;
      }
      const f = rapprocher(fin, aujourdhui);
      return { debut: f === fin ? debut : `${Number(debut.slice(0, 4)) - 1}${debut.slice(4)}`, fin: f };
    }
    const d0 = uneDate(x, aujourdhui);
    if (!d0) return null;
    const debut = rapprocher(d0, aujourdhui);
    // La fin se lit à partir du premier jour : « du lundi au mercredi », « du 28/12 au 3/1 ». Mais « du 6/11 au
    // 2/11 » n'est pas une absence de près d'un an : au-delà de deux mois, la fin se relit à partir d'aujourd'hui
    // (et l'erreur dit alors que le dernier jour est avant le premier).
    const proche = uneDate(y, debut);
    const fin = proche && ecartJours(debut, proche) <= 62 ? proche : (uneDate(y, aujourdhui) ?? proche);
    return fin ? { debut, fin } : null;
  }
  return null;
}

export type AnalyseAbsence<P extends Nomme = Nomme> = {
  /** La personne absente ; null : la personne qui écrit. */
  personne: P | null;
  motif: MotifAbsence;
  plage: Plage | null;
  /** La phrase est bien une absence, mais il manque quelque chose (la date, le plus souvent). */
  manque?: string;
};

/**
 * « absent du 2/11 au 6/11 », « Myriam en congé la semaine prochaine », « absence de Myriam demain (formation) ».
 * null si la phrase n'est pas une absence, y compris quand il reste des mots qui n'en font pas partie.
 */
export function analyserAbsence<P extends Nomme>(saisie: string, aujourdhui: string, o: { personnes?: P[]; moiId?: string } = {}): AnalyseAbsence<P> | null {
  const t = String(saisie ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  // Sans personne d'abord (« en congé demain »), puis le moins de mots possible avant (« Myriam en congé »).
  const tete = new RegExp(`^(?:(${MOT}(?:\\s+${MOT}){0,2}?)\\s+(?:(?:sera|est)\\s+)?)??${TETE}(?=$|[\\s,:;.])`, "iu").exec(t);
  if (!tete) return null;
  const personnes = o.personnes ?? [];
  let personne: P | null = null;
  const avant = (tete[1] ?? "").replace(/\s+(?:est|sera)$/iu, "").trim();
  if (avant && !/^je(?:\s+(?:suis|serai))?$/iu.test(avant)) {
    // Des mots avant « absent » : une personne (« Myriam absente… »), sinon ce n'est pas une absence.
    const p = personneNommee(avant, personnes, o.moiId);
    if (!p) return null;
    personne = p.id === o.moiId ? null : p;
  }
  let motif = motifDe(tete[2]);
  let reste = ` ${t.slice(tete[0].length)} `;
  // « absence de Myriam … », « congé pour Myriam … », « absente : Myriam … »
  const de = new RegExp(`^\\s*[:,]?\\s*(?:(?:de|pour)\\s+|d['’]\\s*|:\\s*)(${MOT}(?:\\s+${MOT})?)`, "iu").exec(reste);
  if (de && !personne && !avant) {
    const mots = de[1].split(/\s+/);
    for (let n = mots.length; n >= 1; n--) {
      const p = personneNommee(mots.slice(0, n).join(" "), personnes, o.moiId);
      if (p) {
        personne = p.id === o.moiId ? null : p;
        const fin = de[0].indexOf(mots[n - 1], de[0].length - de[1].length) + mots[n - 1].length;
        reste = ` ${reste.slice(fin)} `;
        break;
      }
    }
  }
  // Le motif dit en plus : « (formation) », « pour formation », « en mission ».
  const precise = /[\s,(]+(?:pour\s+|en\s+)?(cong[ée]s?|formation|mission)\)?(?=\s*$)/iu.exec(reste);
  if (precise) {
    motif = motifDe(precise[1]);
    reste = reste.slice(0, precise.index);
  }
  reste = reste
    .replace(/[\s,]+(?:toute\s+la\s+journ[ée]e|la\s+journ[ée]e|inclus)\s*$/iu, " ")
    .replace(/^[\s,:;.–—-]+|[\s,;.!]+$/gu, "")
    .trim();
  if (!reste) return { personne, motif, plage: null, manque: "Dites quand : « absent du 2/11 au 6/11 », « en congé la semaine prochaine », « en formation jeudi »." };
  const plage = periodeDe(reste, aujourdhui);
  // Des mots qui ne sont pas une date : une tâche (« Congé de Myriam : préparer la passation »).
  if (!plage) return null;
  const erreur = erreurAbsence(plage, aujourdhui);
  return erreur ? { personne, motif, plage, manque: erreur } : { personne, motif, plage };
}
