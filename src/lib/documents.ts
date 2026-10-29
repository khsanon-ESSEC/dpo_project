/**
 * Documents d'un projet : leurs catégories, et celle que suggère le nom du fichier
 * (« CDC_recrutement_v2.docx » → cahier des charges). Pur (sans base) : sert à la page et au serveur.
 * Testé dans tests/documents.test.ts. Les formats acceptés sont ceux des pièces jointes (src/lib/pieces.ts).
 */
export const CATEGORIES_DOCUMENT = {
  note_de_cadrage: "Note de cadrage",
  cahier_des_charges: "Cahier des charges",
  specification: "Spécification technique",
  compte_rendu: "Compte rendu de réunion",
  autre: "Autre document",
} as const;
export type CategorieDocument = keyof typeof CATEGORIES_DOCUMENT;
export const ORDRE_CATEGORIES = Object.keys(CATEGORIES_DOCUMENT) as CategorieDocument[];

/** Un projet garde au plus cent documents (10 Mo chacun au plus). */
export const DOCUMENTS_MAX_PAR_PROJET = 100;

export const estCategorie = (v: unknown): v is CategorieDocument => typeof v === "string" && Object.hasOwn(CATEGORIES_DOCUMENT, v);

/** La catégorie que suggère le nom du fichier, ou « autre ». */
export function categorieDevinee(nom: string): CategorieDocument {
  const n = ` ${nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/[^a-z0-9]+/g, " ")} `;
  if (/ (note de cadrage|cadrage|ndc|fiche projet|fiche de projet|charte projet|charte de projet) /.test(n)) return "note_de_cadrage";
  if (/ (cahier des charges|cdc|expression des besoins|besoins) /.test(n)) return "cahier_des_charges";
  if (/ (spec|specs|specification|specifications|sfd|std|stb|architecture|conception|technique) /.test(n)) return "specification";
  if (/ (compte rendu|cr|pv|proces verbal|minute|minutes|reunion|comite|copil) /.test(n)) return "compte_rendu";
  return "autre";
}
