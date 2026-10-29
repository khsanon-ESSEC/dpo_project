/**
 * Les cases de la fiche de projet de la DPO (note de cadrage) que l'application connaît (29 octobre 2026) : le type de
 * solution, les informations déjà disponibles, et les spécialisations de la DPO impliquées. Elles servent au kit de
 * démarrage (src/lib/kit.ts). `null` en base : la fiche n'a pas encore été remplie (projets d'avant).
 */

export const TYPES_SOLUTION = [
  { cle: "amelioration_produit", libelle: "Amélioration de produit" },
  { cle: "amelioration_processus", libelle: "Amélioration de processus / procédures" },
  { cle: "nouveau_produit", libelle: "Nouveau produit" },
  { cle: "nouveau_processus", libelle: "Nouveau processus" },
] as const;

export const INFOS_DISPONIBLES = [
  { cle: "techniques", libelle: "Techniques" },
  { cle: "organisationnelles", libelle: "Organisationnelles" },
  { cle: "financieres", libelle: "Financières" },
] as const;

export const SPECIALISATIONS = [
  { cle: "etudes", libelle: "Études, Planification et Conception" },
  { cle: "solutions", libelle: "Solutions Technologiques" },
  { cle: "deploiement", libelle: "Déploiement & Formation" },
] as const;

export type TypeSolution = (typeof TYPES_SOLUTION)[number]["cle"];
export type InfoDisponible = (typeof INFOS_DISPONIBLES)[number]["cle"];
export type Specialisation = (typeof SPECIALISATIONS)[number]["cle"];
export type Cadrage = { types: TypeSolution[]; infos: InfoDisponible[]; specialisations: Specialisation[] };

const garder = <T extends string>(valeurs: unknown, permis: readonly { cle: T }[]): T[] => {
  const l = Array.isArray(valeurs) ? valeurs.map(String) : [];
  return permis.map((x) => x.cle).filter((c) => l.includes(c));
};

/** Relire un cadrage (base ou formulaire) : seulement les cases connues, dans l'ordre de la fiche. */
export function cadrageValide(v: unknown): Cadrage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return { types: garder(o.types, TYPES_SOLUTION), infos: garder(o.infos, INFOS_DISPONIBLES), specialisations: garder(o.specialisations, SPECIALISATIONS) };
}

/**
 * Le cadrage d'un formulaire : les cases cochées (`cadrage-type`, `cadrage-info`, `cadrage-specialisation`), si le
 * formulaire montrait ces cases (champ caché `cadrage` = « 1 ») ; sinon, null (rien à changer).
 */
export function cadrageDuFormulaire(form: { get(k: string): unknown; getAll(k: string): unknown[] }): Cadrage | null {
  if (String(form.get("cadrage") ?? "") !== "1") return null;
  return cadrageValide({ types: form.getAll("cadrage-type"), infos: form.getAll("cadrage-info"), specialisations: form.getAll("cadrage-specialisation") });
}

const libelles = <T extends string>(cles: T[], liste: readonly { cle: T; libelle: string }[]) => cles.map((c) => liste.find((x) => x.cle === c)!.libelle);

/** Pour l'affichage (fiche du projet, fiche exportée) : une ligne par rubrique, « — » si rien n'est coché. */
export function lignesCadrage(c: Cadrage) {
  return [
    { rubrique: "Type de solution", valeur: libelles(c.types, TYPES_SOLUTION).join(", ") || "—" },
    { rubrique: "Informations déjà disponibles", valeur: libelles(c.infos, INFOS_DISPONIBLES).join(", ") || "Aucune" },
    { rubrique: "Spécialisations DPO impliquées", valeur: libelles(c.specialisations, SPECIALISATIONS).join(", ") || "—" },
  ];
}
