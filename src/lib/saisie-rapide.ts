/**
 * Ajouter une tâche en une ligne : « Relire maquettes UR vendredi 2h ».
 * On reconnaît le code d'un projet écrit en majuscules (UR), une échéance (aujourd'hui, demain, après-demain, un jour de la
 * semaine, « lundi prochain », « semaine prochaine », « fin du mois », 12/11, 12 novembre, « le 12 ») et une
 * estimation (2h). Le reste est le titre. Pur (sans base) : sert à l'aperçu dans la page et, à nouveau, au
 * serveur, qui ne fait jamais confiance à l'aperçu. Testé dans tests/saisie-rapide.test.ts.
 */
import { ajouterJours, jourComplet, lundiDe, premierDuMois } from "@/lib/dates";

export type ProjetSaisie = { id: string; code: string; titre: string };
export type Morceau = { type: "projet" | "echeance" | "heures"; texte: string };
export type Analyse = { titre: string; projet: ProjetSaisie | null; echeance: string | null; heures: number | null; morceaux: Morceau[] };

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

export function analyserSaisie(saisie: string, aujourdhui: string, projets: ProjetSaisie[]): Analyse {
  let texte = ` ${String(saisie ?? "").replace(/\s+/g, " ").trim().slice(0, 300)} `;
  const morceaux: Morceau[] = [];
  const retirer = (m: RegExpExecArray) => {
    texte = `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}`;
  };

  // Projet : le code tel quel, en majuscules (« UR »). Dans la barre, « / » ouvre aussi la liste des projets.
  let projet: ProjetSaisie | null = null;
  const parCode = new Map(projets.map((p) => [p.code.toUpperCase(), p]));
  const nu = new RegExp(`${D}([A-Z0-9]{2,4})${F}`, "g");
  for (let m = nu.exec(texte); m; m = nu.exec(texte)) {
    if (/[A-Z]/.test(m[1]) && parCode.has(m[1])) {
      projet = parCode.get(m[1])!;
      retirer(m);
      break;
    }
  }
  if (projet) morceaux.push({ type: "projet", texte: `${projet.code} · ${projet.titre}` });

  // Échéance : la première règle qui reconnaît une date valide.
  let echeance: string | null = null;
  for (const r of REGLES) {
    const m = r.motif.exec(texte);
    const d = m ? r.date(m, aujourdhui) : null;
    if (m && d) {
      echeance = d;
      retirer(m);
      morceaux.push({ type: "echeance", texte: jourComplet(d) });
      break;
    }
  }

  // Estimation : « 2h », « 3 h », « en 4 heures » (de 1 à 400 heures).
  let heures: number | null = null;
  const h = HEURES.exec(texte);
  if (h && Number(h[1]) >= 1 && Number(h[1]) <= 400) {
    heures = Number(h[1]);
    retirer(h);
    morceaux.push({ type: "heures", texte: `${heures} h de travail` });
  }

  const titre = texte
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s+(?:pour|avant|le|sur|en|-|–|—|,|:))+$/i, "")
    .replace(/^[-–—,:]\s*/, "")
    .trim()
    .slice(0, 200);
  return { titre, projet, echeance, heures, morceaux };
}
