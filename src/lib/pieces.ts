/**
 * Pièces jointes : ce qui est accepté. Pur (sans base), testé dans tests/pieces.test.ts.
 *
 * - formats de bureau courants seulement, reconnus à l'extension ET au contenu (signature du fichier) :
 *   un exécutable renommé en .pdf est refusé ;
 * - 10 Mo au plus par fichier, 10 fichiers au plus par champ ;
 * - le fichier est toujours servi en téléchargement (jamais affiché dans la page), avec son type d'origine.
 */

export const TAILLE_MAX = 10 * 1024 * 1024;
export const PIECES_MAX_PAR_CHAMP = 10;

type Format = { type: string; signature: (o: Uint8Array) => boolean; libelle: string };

const commence = (o: Uint8Array, ...octets: number[]) => octets.every((b, i) => o[i] === b);
const zip = (o: Uint8Array) => commence(o, 0x50, 0x4b, 0x03, 0x04);
const ole = (o: Uint8Array) => commence(o, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
/** Texte : pas d'octet nul ni de caractère de contrôle autre que tabulation et fins de ligne (premiers 8 Ko). */
const texte = (o: Uint8Array) => {
  const n = Math.min(o.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = o[i];
    if (b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c)) return false;
  }
  return true;
};

export const FORMATS: Record<string, Format> = {
  pdf: { type: "application/pdf", signature: (o) => commence(o, 0x25, 0x50, 0x44, 0x46, 0x2d), libelle: "PDF" },
  png: { type: "image/png", signature: (o) => commence(o, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), libelle: "Image" },
  jpg: { type: "image/jpeg", signature: (o) => commence(o, 0xff, 0xd8, 0xff), libelle: "Image" },
  jpeg: { type: "image/jpeg", signature: (o) => commence(o, 0xff, 0xd8, 0xff), libelle: "Image" },
  webp: { type: "image/webp", signature: (o) => commence(o, 0x52, 0x49, 0x46, 0x46) && o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50, libelle: "Image" },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: zip, libelle: "Word" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: zip, libelle: "Excel" },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", signature: zip, libelle: "PowerPoint" },
  doc: { type: "application/msword", signature: ole, libelle: "Word" },
  xls: { type: "application/vnd.ms-excel", signature: ole, libelle: "Excel" },
  ppt: { type: "application/vnd.ms-powerpoint", signature: ole, libelle: "PowerPoint" },
  csv: { type: "text/csv", signature: texte, libelle: "Tableau CSV" },
  txt: { type: "text/plain", signature: texte, libelle: "Texte" },
};

export const EXTENSIONS_ACCEPTEES = Object.keys(FORMATS);
/** Pour l'attribut accept d'un champ de fichier. */
export const ACCEPT = EXTENSIONS_ACCEPTEES.map((e) => `.${e}`).join(",");

export function extensionDe(nom: string): string {
  const m = nom.toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "";
}

/** Nom de fichier sans chemin ni caractère gênant, 120 caractères au plus (extension gardée). */
export function nomPropre(nom: string): string {
  const base = (nom.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || base === "." || base === "..") return "fichier";
  if (base.length <= 120) return base;
  const ext = extensionDe(base);
  return ext ? `${base.slice(0, 115 - ext.length)}….${ext}` : base.slice(0, 120);
}

export type Verdict = { ok: true; nom: string; type: string; libelle: string } | { ok: false; erreur: string };

export function verifierFichier(nom: string, contenu: Uint8Array): Verdict {
  const propre = nomPropre(nom);
  if (contenu.length === 0) return { ok: false, erreur: `« ${propre} » est vide.` };
  if (contenu.length > TAILLE_MAX) return { ok: false, erreur: `« ${propre} » dépasse 10 Mo.` };
  const f = FORMATS[extensionDe(propre)];
  if (!f) return { ok: false, erreur: `« ${propre} » : format non accepté (PDF, images, Word, Excel, PowerPoint, CSV ou texte).` };
  if (!f.signature(contenu)) return { ok: false, erreur: `« ${propre} » ne ressemble pas à un fichier ${f.libelle} : il n'a pas été joint.` };
  return { ok: true, nom: propre, type: f.type, libelle: f.libelle };
}

/** « 1,2 Mo », « 340 Ko » */
export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/** En-tête Content-Disposition sûr pour un nom accentué (RFC 6266 / 5987). */
export function dispositionTelechargement(nom: string): string {
  const ascii = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}
