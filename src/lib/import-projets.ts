/**
 * Import en vrac des projets et des tâches (demandé le 29 octobre 2026), par exemple pour la première mise en
 * service : un modèle Excel à télécharger, à remplir, puis à déposer. Pur : lecture des lignes et des valeurs
 * (dates, statuts, priorités, oui/non). Les contrôles qui demandent la base (personnes, codes pris, droits) sont
 * dans src/lib/donnees/import-projets.ts. Testé dans tests/import-projets.test.ts.
 */
import { cleNom } from "@/lib/projets";

export type Colonne = { cle: string; titre: string; noms: string[]; largeur: number; aide: string; exemple: string };

export const COLONNES_PROJETS: Colonne[] = [
  { cle: "code", titre: "Code", noms: ["code"], largeur: 8, aide: "2 à 4 lettres ou chiffres ; tiré du titre si vide.", exemple: "SE" },
  { cle: "titre", titre: "Titre", noms: ["titre", "projet", "nom du projet"], largeur: 40, aide: "Obligatoire.", exemple: "Signature électronique des contrats" },
  { cle: "description", titre: "Description", noms: ["description"], largeur: 50, aide: "", exemple: "Signer les contrats de prêt en ligne." },
  { cle: "programme", titre: "Programme", noms: ["programme"], largeur: 32, aide: "Ajouté à la liste des programmes s'il n'y est pas.", exemple: "Amélioration de l'expérience client" },
  { cle: "division", titre: "Division", noms: ["division", "division du projet"], largeur: 28, aide: "Vide : la DPO. Une autre division est ajoutée à la liste.", exemple: "" },
  { cle: "chef", titre: "Chef de projet (courriel)", noms: ["chef de projet", "chef de projet courriel", "chef", "courriel du chef de projet"], largeur: 32, aide: "Obligatoire : une personne de l'organisation.", exemple: "daphnee.joseph@unibankhaiti.com" },
  { cle: "referent", titre: "Référent DPO (courriel)", noms: ["referent dpo", "referent dpo courriel", "referent"], largeur: 30, aide: "Obligatoire si le chef est hors division.", exemple: "" },
  { cle: "sponsor", titre: "Sponsor métier (courriel)", noms: ["sponsor metier", "sponsor metier courriel", "sponsor"], largeur: 30, aide: "", exemple: "" },
  { cle: "equipe", titre: "Équipe (courriels séparés par ;)", noms: ["equipe", "equipe courriels separes par", "equipe courriels", "membres"], largeur: 44, aide: "Les membres de l'équipe projet.", exemple: "ricardo.etienne@unibankhaiti.com; joel.dorval@unibankhaiti.com" },
  { cle: "statut", titre: "Statut", noms: ["statut", "etat"], largeur: 12, aide: "En attente, En cours, Continu ou Finalisé ; En cours si vide.", exemple: "En cours" },
  { cle: "priorite", titre: "Priorité", noms: ["priorite"], largeur: 10, aide: "Haute, Normale ou Basse ; Normale si vide.", exemple: "Haute" },
  { cle: "strategique", titre: "Stratégique (oui/non)", noms: ["strategique", "strategique oui non"], largeur: 12, aide: "Oui : il figure au rapport mensuel au conseil.", exemple: "Oui" },
  { cle: "dateEntree", titre: "Date d'entrée (JJ/MM/AAAA)", noms: ["date d entree", "date d entree jj mm aaaa", "entree", "debut"], largeur: 14, aide: "", exemple: "02/11/2026" },
  { cle: "dateFinInitiale", titre: "Fin prévue initialement (JJ/MM/AAAA)", noms: ["fin prevue initialement", "fin prevue initialement jj mm aaaa", "fin initiale"], largeur: 16, aide: "La fin prévue si vide.", exemple: "" },
  { cle: "dateFinPrevue", titre: "Fin prévue (JJ/MM/AAAA)", noms: ["fin prevue", "fin prevue jj mm aaaa", "fin"], largeur: 14, aide: "", exemple: "31/03/2027" },
  { cle: "dateLancementPrevue", titre: "Lancement prévu (JJ/MM/AAAA)", noms: ["lancement prevu", "lancement prevu jj mm aaaa", "lancement"], largeur: 14, aide: "", exemple: "15/04/2027" },
];

export const COLONNES_TACHES: Colonne[] = [
  { cle: "projet", titre: "Projet (code)", noms: ["projet", "projet code", "code projet", "code"], largeur: 10, aide: "Le code d'un projet existant ; vide : hors projet.", exemple: "SE" },
  { cle: "titre", titre: "Titre", noms: ["titre", "tache"], largeur: 44, aide: "Obligatoire.", exemple: "Rédiger le cahier des charges" },
  { cle: "description", titre: "Description", noms: ["description", "precisions"], largeur: 40, aide: "", exemple: "" },
  { cle: "pour", titre: "Pour (courriel)", noms: ["pour", "pour courriel", "assigne", "assignee a", "responsable", "personne"], largeur: 32, aide: "Obligatoire : une personne de l'organisation.", exemple: "ricardo.etienne@unibankhaiti.com" },
  { cle: "livrable", titre: "Livrable", noms: ["livrable"], largeur: 30, aide: "Le livrable du projet auquel elle mène ; créé s'il n'existe pas.", exemple: "Cahier des charges validé" },
  { cle: "statut", titre: "Statut", noms: ["statut", "etat"], largeur: 12, aide: "À faire, En cours, Bloquée ou Faite ; À faire si vide.", exemple: "À faire" },
  { cle: "priorite", titre: "Priorité", noms: ["priorite"], largeur: 10, aide: "Haute, Normale ou Basse.", exemple: "Normale" },
  { cle: "debut", titre: "Début (JJ/MM/AAAA)", noms: ["debut", "debut jj mm aaaa", "date de debut"], largeur: 14, aide: "", exemple: "09/11/2026" },
  { cle: "echeance", titre: "Échéance (JJ/MM/AAAA)", noms: ["echeance", "echeance jj mm aaaa", "date limite"], largeur: 14, aide: "", exemple: "20/11/2026" },
  { cle: "estimation", titre: "Temps estimé (heures)", noms: ["temps estime", "temps estime heures", "estimation", "heures"], largeur: 12, aide: "De 1 à 400 heures.", exemple: "12" },
];

export type LigneBrute = { ligne: number; valeurs: Record<string, string> };

/** Les lignes d'un tableau : la ligne d'en-têtes est cherchée dans les cinq premières (colonnes reconnues à leur nom). */
export function lireTableau(tableau: string[][], colonnes: Colonne[], obligatoire: string): { lignes: LigneBrute[] } | { erreur: string } {
  const cle = (s: string) => cleNom(s).replace(/\s+/g, " ");
  let entete = -1;
  let carte: Record<string, number> = {};
  for (let i = 0; i < Math.min(5, tableau.length) && entete < 0; i++) {
    const c: Record<string, number> = {};
    (tableau[i] ?? []).forEach((v, j) => {
      const k = cle(v);
      for (const col of colonnes) if (c[col.cle] === undefined && (col.noms.includes(k) || cle(col.titre) === k)) c[col.cle] = j;
    });
    if (c[obligatoire] !== undefined) {
      entete = i;
      carte = c;
    }
  }
  const titreObligatoire = colonnes.find((c) => c.cle === obligatoire)!.titre;
  if (entete < 0) return { erreur: `Colonne « ${titreObligatoire} » introuvable : partez du modèle à télécharger.` };
  const lignes: LigneBrute[] = [];
  for (let i = entete + 1; i < tableau.length; i++) {
    const l = tableau[i] ?? [];
    const valeurs: Record<string, string> = {};
    for (const col of colonnes) valeurs[col.cle] = carte[col.cle] !== undefined ? String(l[carte[col.cle]] ?? "").normalize("NFC").replace(/\s+/g, " ").trim() : "";
    if (Object.values(valeurs).every((v) => !v)) continue;
    lignes.push({ ligne: i + 1, valeurs });
  }
  if (!lignes.length) return { erreur: "Aucune ligne à importer (après la ligne d'en-têtes)." };
  if (lignes.length > 2000) return { erreur: "2 000 lignes au plus par import." };
  return { lignes };
}

/** Une date : 31/12/2026, 31/12/26, 31-12-2026, 2026-12-31, ou une date Excel (nombre de jours depuis 1899). */
export function lireDate(v: string): { date: string | null } | { erreur: string } {
  const s = v.trim();
  if (!s) return { date: null };
  const valide = (a: number, m: number, j: number) => {
    const d = new Date(Date.UTC(a, m - 1, j, 12));
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j && a >= 2000 && a <= 2100 ? d.toISOString().slice(0, 10) : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  let d: string | null = null;
  if (m) d = valide(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) d = valide(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
  else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    const x = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    d = valide(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  }
  return d ? { date: d } : { erreur: `date illisible « ${s.slice(0, 20)} » (attendu : JJ/MM/AAAA)` };
}

const choix = <T extends string>(v: string, table: Record<string, T>, defaut: T): T | null => {
  const k = cleNom(v);
  if (!k) return defaut;
  return table[k] ?? null;
};

export const lireStatutProjet = (v: string) =>
  choix(v, { "en attente": "en_attente", attente: "en_attente", "en cours": "en_cours", encours: "en_cours", continu: "continu", continue: "continu", finalise: "finalise", termine: "finalise", cloture: "finalise" } as const, "en_cours");
export const lireStatutTache = (v: string) =>
  choix(v, { "a faire": "a_faire", afaire: "a_faire", "en cours": "en_cours", bloquee: "bloquee", bloque: "bloquee", faite: "faite", fait: "faite", terminee: "faite", termine: "faite" } as const, "a_faire");
export const lirePrioriteImport = (v: string) => choix(v, { haute: "haute", normale: "normale", basse: "basse", elevee: "haute", faible: "basse" } as const, "normale");
export const lireOuiNon = (v: string): boolean | null => {
  const k = cleNom(v);
  if (!k || ["non", "n", "no", "0", "faux", "false"].includes(k)) return false;
  return ["oui", "o", "yes", "y", "1", "x", "vrai", "true"].includes(k) ? true : null;
};

const COURRIEL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const lireCourriel = (v: string): { courriel: string | null } | { erreur: string } => {
  const s = v.trim().toLowerCase();
  if (!s) return { courriel: null };
  return COURRIEL.test(s) ? { courriel: s } : { erreur: `courriel illisible « ${s.slice(0, 60)} »` };
};
export const lireCourriels = (v: string): { courriels: string[] } | { erreur: string } => {
  const morceaux = v.split(/[;,\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const mauvais = morceaux.find((x) => !COURRIEL.test(x));
  return mauvais ? { erreur: `courriel illisible « ${mauvais.slice(0, 60)} »` } : { courriels: [...new Set(morceaux)] };
};
export const lireHeures = (v: string): { heures: number | null } | { erreur: string } => {
  const s = v.trim().replace(",", ".");
  if (!s) return { heures: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 && n <= 400 ? { heures: Math.round(n) } : { erreur: `temps estimé « ${s.slice(0, 10)} » : de 1 à 400 heures` };
};
