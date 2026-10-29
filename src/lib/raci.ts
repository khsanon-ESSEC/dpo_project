/**
 * RACI (demandé le 29 octobre 2026 : « RACI type DPO ») : qui réalise (R), approuve (A), est consulté (C) ou
 * informé (I) pour chaque activité d'un projet. Un RACI type, défini une fois dans Organisation, vaut pour tous les
 * projets ; un projet qui s'en écarte a le sien. Chaque colonne est un rôle ; elle peut renvoyer aux personnes du
 * projet (le sponsor métier, le chef de projet, l'équipe) pour que la fiche affiche leurs noms.
 * Règles pures ; la base est dans src/lib/donnees/raci.ts. Testé dans tests/raci.test.ts.
 */

export const LETTRES = ["R", "A", "C", "I"] as const;
export type Lettre = (typeof LETTRES)[number];
export const LIBELLE_LETTRE: Record<Lettre, string> = { R: "Réalise", A: "Approuve", C: "Consulté", I: "Informé" };

/** À qui renvoie une colonne : le sponsor métier, le chef de projet (et le référent DPO), l'équipe, ou personne en particulier. */
export const QUI = ["sponsor", "chef", "equipe", "libre"] as const;
export type Qui = (typeof QUI)[number];
export const LIBELLE_QUI: Record<Qui, string> = { sponsor: "Le sponsor métier du projet", chef: "Le chef de projet", equipe: "L'équipe du projet", libre: "Pas de nom (un rôle)" };

export type ColonneRaci = { libelle: string; qui: Qui };
export type LigneRaci = { activite: string; lettres: (Lettre | "")[] };
export type Raci = { colonnes: ColonneRaci[]; lignes: LigneRaci[] };

export const LIMITES = { colonnes: 6, lignes: 30, libelle: 60, activite: 120 } as const;

/** Le RACI type de la DPO, repris du tableau de la note de cadrage (29 octobre 2026). */
export const RACI_DPO: Raci = {
  colonnes: [
    { libelle: "Demandeur (Métier)", qui: "sponsor" },
    { libelle: "Chef de projet (DPO)", qui: "chef" },
    { libelle: "Équipes DPO (Solutions, Méthodes)", qui: "equipe" },
  ],
  lignes: [
    { activite: "Rédiger la note de cadrage", lettres: ["A", "R", "C"] },
    { activite: "Rédiger le cahier des charges", lettres: ["A", "R", "C"] },
    { activite: "Valider la solution", lettres: ["A", "C", "R"] },
    { activite: "Former les utilisateurs", lettres: ["A", "I", "R"] },
    { activite: "Gérer les demandes d'évolution", lettres: ["A", "C", "R"] },
  ],
};

const propre = (v: unknown, max: number) => String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
const lettre = (v: unknown): Lettre | "" | null => {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "" || s === "-" || s === "—" ? "" : (LETTRES as readonly string[]).includes(s) ? (s as Lettre) : null;
};

/** Lit un RACI envoyé par le formulaire (JSON) et le contrôle : 1 à 6 rôles, 1 à 30 activités, un seul « A » par activité. */
export function validerRaci(brut: unknown): { raci: Raci; avertissements: string[] } | { erreur: string } {
  let d: unknown = brut;
  if (typeof brut === "string") {
    try {
      d = JSON.parse(brut);
    } catch {
      return { erreur: "Tableau illisible : rechargez la page et recommencez." };
    }
  }
  const o = (d ?? {}) as { colonnes?: unknown; lignes?: unknown };
  if (!Array.isArray(o.colonnes) || !Array.isArray(o.lignes)) return { erreur: "Tableau illisible : rechargez la page et recommencez." };
  if (!o.colonnes.length) return { erreur: "Gardez au moins un rôle (une colonne)." };
  if (o.colonnes.length > LIMITES.colonnes) return { erreur: `${LIMITES.colonnes} rôles au plus.` };
  const colonnes: ColonneRaci[] = [];
  for (const c of o.colonnes as { libelle?: unknown; qui?: unknown }[]) {
    const libelle = propre(c?.libelle, LIMITES.libelle);
    if (libelle.length < 2) return { erreur: "Nommez chaque rôle (ex. : « Demandeur (Métier) »)." };
    const qui = (QUI as readonly string[]).includes(String(c?.qui)) ? (c.qui as Qui) : "libre";
    colonnes.push({ libelle, qui });
  }
  const lignes: LigneRaci[] = [];
  const avertissements: string[] = [];
  for (const l of o.lignes as { activite?: unknown; lettres?: unknown }[]) {
    const activite = propre(l?.activite, LIMITES.activite);
    const valeurs = Array.isArray(l?.lettres) ? (l.lettres as unknown[]) : [];
    const lettres: (Lettre | "")[] = [];
    for (let i = 0; i < colonnes.length; i++) {
      const x = lettre(valeurs[i]);
      if (x === null) return { erreur: `« ${activite || "Activité"} » : seules les lettres R, A, C et I.` };
      lettres.push(x);
    }
    if (!activite && lettres.every((x) => !x)) continue; // ligne laissée vide : ignorée
    if (activite.length < 2) return { erreur: "Nommez chaque activité (ex. : « Valider la solution »)." };
    if (lettres.filter((x) => x === "A").length > 1) return { erreur: `« ${activite} » : un seul rôle approuve (A).` };
    if (!lettres.includes("R")) avertissements.push(`« ${activite} » : personne ne réalise (R).`);
    if (!lettres.includes("A")) avertissements.push(`« ${activite} » : personne n'approuve (A).`);
    lignes.push({ activite, lettres });
  }
  if (!lignes.length) return { erreur: "Gardez au moins une activité." };
  if (lignes.length > LIMITES.lignes) return { erreur: `${LIMITES.lignes} activités au plus.` };
  const vues = new Set<string>();
  for (const l of lignes) {
    const k = l.activite.toLocaleLowerCase("fr");
    if (vues.has(k)) return { erreur: `« ${l.activite} » est en double.` };
    vues.add(k);
  }
  return { raci: { colonnes, lignes }, avertissements };
}

/** Le même RACI (pour savoir si un RACI de projet s'écarte encore du type). */
export const memeRaci = (x: Raci, y: Raci) => JSON.stringify(x) === JSON.stringify(y);

/** Les noms à afficher sous un rôle, d'après les personnes du projet. */
export function nomsDuRole(qui: Qui, p: { sponsor: string | null; chef: string | null; referent: string | null; equipe: string[] }, max = 3): string {
  if (qui === "sponsor") return p.sponsor ?? "Sponsor à désigner";
  if (qui === "chef") return [p.chef, p.referent ? `${p.referent} (référent DPO)` : null].filter(Boolean).join(", ") || "Chef de projet à désigner";
  if (qui === "equipe") return p.equipe.length ? `${p.equipe.slice(0, max).join(", ")}${p.equipe.length > max ? ` et ${p.equipe.length - max} autre${p.equipe.length - max > 1 ? "s" : ""}` : ""}` : "Équipe à constituer";
  return "";
}
