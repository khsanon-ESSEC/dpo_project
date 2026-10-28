/**
 * Lire un rapport d'un coup d'œil : quelques chiffres de la semaine et ce qui a changé depuis le rapport
 * précédent (feux, blocages qui durent, décisions nouvelles, temps en réunion, charge ressentie).
 * Fonctions pures : elles travaillent sur ce que le lecteur a déjà le droit de lire.
 */
import { libelleRessenti, libelleSante, lireReunions, type Champ, type ReunionsFigees } from "@/lib/modeles";
import { dureeTexte } from "@/lib/projets";

export type LigneResume = {
  id: string;
  champId: string;
  partie: string | null;
  texte: string;
  origines: string[];
  remonte?: boolean;
  retiree?: boolean;
  resolu?: boolean;
  depuisSemaine?: string | null;
  projetId: string | null;
  projetCode?: string | null;
  projetTitre?: string | null;
};
export type ReponseResume = { champId: string; projetId: string | null; valeur: string; commentaire?: string | null; projetCode?: string | null; projetTitre?: string | null };

export type Resume = {
  /** null : le modèle n'a pas cette rubrique. */
  fait: number | null;
  bloques: number | null;
  /** Blocages qui reviennent depuis au moins deux semaines. */
  anciens: { texte: string; semaines: number; projetCode: string | null }[];
  resolus: number;
  decisions: number | null;
  /** Décisions attendues écrites en lignes et apparues cette semaine. */
  decisionsNouvelles: number;
  /** Décisions attendues écrites dans un champ de texte (pour savoir si elles sont nouvelles). */
  textesDecision: string[];
  reunion: { minutes: number; n: number } | null;
  charge: { valeur: string; commentaire: string } | null;
  sante: Map<string, { valeur: string; code: string; titre: string }>;
};

const RANG_SANTE: Record<string, number> = { dans_les_temps: 0, a_surveiller: 1, en_retard: 2 };
const RANG_RESSENTI: Record<string, number> = { legere: 0, normale: 1, lourde: 2, trop_lourde: 3 };

/** Nombre de semaines depuis lesquelles une ligne revient (1 : elle est de cette semaine). */
export function semainesDepuis(depuis: string | null | undefined, semaine: string | undefined): number {
  if (!depuis || !semaine || depuis >= semaine) return 1;
  return Math.round((Date.parse(`${semaine}T12:00:00Z`) - Date.parse(`${depuis}T12:00:00Z`)) / (7 * 86400000)) + 1;
}

const normaliser = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Décisions attendues nouvelles par rapport au rapport précédent : lignes apparues, textes qui ont changé. */
export function nouvellesDecisions(m: Resume, p: Resume): number {
  return m.decisionsNouvelles + m.textesDecision.filter((t) => !p.textesDecision.includes(t)).length;
}

const propre = (l: LigneResume) => l.origines.length === 0 && !l.retiree;

/**
 * Les chiffres d'un rapport. `reunions` : la liste du brouillon (aperçu), sinon celle figée à l'envoi.
 * Les lignes reçues de l'équipe ne comptent pas, sauf les éléments « à décider » remontés : ils attendent le lecteur.
 */
export function resumerRapport(f: Champ[], lignes: LigneResume[], reponses: ReponseResume[], semaine: string, reunions?: ReunionsFigees | null): Resume {
  const a = (r: string) => f.some((c) => c.type === "lignes" && c.partie !== "equipe" && c.rubrique === r);
  const siennes = lignes.filter(propre);
  const bloques = siennes.filter((l) => l.partie === "bloque");
  const decisions = siennes.filter((l) => l.partie === "decision" && !l.resolu);
  const remontes = lignes.filter((l) => l.origines.length > 0 && !l.retiree && l.remonte);
  const textesDecision = f.filter((c) => (c.type === "texte" || c.type === "texte_long") && c.rubrique === "decision" && c.partie !== "equipe");
  const textes = textesDecision.map((c) => reponses.find((x) => x.champId === c.id && !x.projetId)?.valeur.trim() ?? "").filter(Boolean);
  const aDecider = f.some((c) => c.type === "reprise" && c.reprise === "a_decider");

  const cReunions = f.find((c) => c.type === "reunions");
  const rv = cReunions ? (reunions ?? lireReunions(reponses.find((x) => x.champId === cReunions.id)?.valeur)) : null;
  const cCharge = f.find((c) => c.type === "charge" && c.partie !== "equipe");
  const rc = cCharge ? reponses.find((x) => x.champId === cCharge.id) : undefined;

  const sante = new Map<string, { valeur: string; code: string; titre: string }>();
  for (const c of f.filter((k) => (k.type === "sante" && k.partie !== "equipe") || (k.type === "reprise" && k.reprise === "sante"))) {
    for (const x of reponses) {
      if (x.champId !== c.id || !x.projetId || !(x.valeur in RANG_SANTE)) continue;
      const deja = sante.get(x.projetId);
      if (!deja || RANG_SANTE[x.valeur] > RANG_SANTE[deja.valeur]) sante.set(x.projetId, { valeur: x.valeur, code: x.projetCode ?? "—", titre: x.projetTitre ?? "" });
    }
  }

  return {
    fait: a("fait") ? siennes.filter((l) => l.partie === "fait").length : null,
    bloques: a("bloque") ? bloques.filter((l) => !l.resolu).length : null,
    anciens: bloques
      .filter((l) => !l.resolu && semainesDepuis(l.depuisSemaine, semaine) >= 2)
      .map((l) => ({ texte: l.texte, semaines: semainesDepuis(l.depuisSemaine, semaine), projetCode: l.projetCode ?? null }))
      .sort((x, y) => y.semaines - x.semaines),
    resolus: siennes.filter((l) => l.resolu && (l.partie === "bloque" || l.partie === "decision")).length,
    decisions: a("decision") || textesDecision.length || aDecider ? decisions.length + remontes.length + textes.length : null,
    decisionsNouvelles: [...decisions, ...remontes].filter((l) => semainesDepuis(l.depuisSemaine, semaine) === 1).length,
    textesDecision: textes.map(normaliser),
    reunion: cReunions ? { minutes: rv?.minutes ?? 0, n: rv?.reunions.length ?? 0 } : null,
    charge: rc?.valeur ? { valeur: rc.valeur, commentaire: rc.commentaire ?? "" } : null,
    sante,
  };
}

export type Changement = {
  /** Sens de l'évolution, pour l'icône et la couleur. */
  ton: "mieux" | "moins_bien" | "alerte" | "neutre";
  /** La partie en gras. */
  fort: string;
  suite: string;
};

const pluriel = (n: number, un: string, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);

/** Ce qui a changé depuis le rapport précédent, du plus important au plus anodin. */
export function changementsDepuis(m: Resume, p: Resume): Changement[] {
  const out: Changement[] = [];
  for (const [id, s] of m.sante) {
    const avant = p.sante.get(id);
    if (!avant || avant.valeur === s.valeur) continue;
    const pire = RANG_SANTE[s.valeur] > RANG_SANTE[avant.valeur];
    out.push({ ton: pire ? "moins_bien" : "mieux", fort: s.titre || s.code, suite: `passe à « ${libelleSante(s.valeur)} » (était « ${libelleSante(avant.valeur)} »)` });
  }
  const nouvelles = nouvellesDecisions(m, p);
  if (nouvelles) out.push({ ton: "alerte", fort: `${nouvelles} ${pluriel(nouvelles, "nouvelle décision", "nouvelles décisions")}`, suite: pluriel(nouvelles, "attendue", "attendues") });
  for (const b of m.anciens.slice(0, 3)) out.push({ ton: "alerte", fort: b.texte.length > 60 ? `${b.texte.slice(0, 57)}…` : b.texte, suite: `bloqué depuis ${b.semaines} semaines` });
  if (m.anciens.length > 3) out.push({ ton: "alerte", fort: `${m.anciens.length - 3} autres blocages`, suite: "durent depuis deux semaines ou plus" });
  if (m.resolus) out.push({ ton: "mieux", fort: `${m.resolus} ${pluriel(m.resolus, "blocage résolu", "blocages résolus")}`, suite: "cette semaine" });
  if (m.fait !== null && p.fait !== null) out.push({ ton: "neutre", fort: `${m.fait} ${pluriel(m.fait, "ligne", "lignes")} dans « Fait »`, suite: `(${p.fait} la semaine dernière)` });
  if (m.reunion && p.reunion && m.reunion.minutes !== p.reunion.minutes) {
    out.push({ ton: "neutre", fort: `${dureeTexte(m.reunion.minutes)} de réunion`, suite: `(${dureeTexte(p.reunion.minutes)} la semaine dernière)` });
  }
  if (m.charge && p.charge && m.charge.valeur !== p.charge.valeur) {
    const pire = (RANG_RESSENTI[m.charge.valeur] ?? 0) > (RANG_RESSENTI[p.charge.valeur] ?? 0);
    out.push({ ton: pire ? "moins_bien" : "mieux", fort: `Charge ${libelleRessenti(m.charge.valeur).toLowerCase()}`, suite: `(était ${libelleRessenti(p.charge.valeur).toLowerCase()})` });
  }
  return out;
}

/** L'écart d'un chiffre avec la semaine dernière : « +2 par rapport à la semaine dernière ». */
export function ecart(n: number | null, avant: number | null | undefined, unite = ""): string | null {
  if (n === null || avant === null || avant === undefined) return null;
  const d = n - avant;
  if (!d) return "comme la semaine dernière";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}${unite} par rapport à la semaine dernière`;
}

/**
 * Sans intertitres, ce qui attend une réponse du lecteur passe devant : décisions, puis blocages ; une partie
 * vide garde sa place.
 */
export function ordreDeLecture(f: Champ[], aContenu: (c: Champ) => boolean = () => true): Champ[] {
  if (f.some((c) => c.type === "intertitre" || c.type === "mon_travail")) return f;
  const rang = (c: Champ) =>
    !aContenu(c)
      ? 2
      : (c.type === "reprise" && c.reprise === "a_decider") || ((c.type === "lignes" || c.type === "texte" || c.type === "texte_long") && c.rubrique === "decision")
        ? 0
        : c.type === "lignes" && c.rubrique === "bloque"
          ? 1
          : 2;
  return f.map((c, i) => ({ c, i })).sort((a, b) => rang(a.c) - rang(b.c) || a.i - b.i).map((x) => x.c);
}
