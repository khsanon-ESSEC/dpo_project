/**
 * Lire et écrire un petit tableau Excel (.xlsx) ou CSV, sans bibliothèque de tableur : un fichier .xlsx est
 * une archive zip de fichiers XML (fflate, déjà présent avec docx). On ne lit que les valeurs des cellules de
 * la première feuille : ni formules, ni macros, ni liens externes (rien n'est exécuté ni suivi).
 * Garde-fous : taille du fichier, taille décompressée annoncée, nombre de lignes et de colonnes.
 * Testé dans tests/import-organisation.test.ts.
 */
import { strToU8, unzipSync, zipSync, type UnzipFileInfo } from "fflate";

export const LIMITES = { octets: 2 * 1024 * 1024, decompresse: 20 * 1024 * 1024, lignes: 3000, colonnes: 30 };

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decoderXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ENTITES[e] ?? m;
  });
}
const echapperXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** « B12 » → colonne 1 (base 0). */
function colonne(ref: string): number {
  const lettres = /^([A-Z]{1,3})/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Texte d'un élément <si> ou <is> : ses <t>, y compris dans les morceaux mis en forme (<r>), sans la phonétique (<rPh>). */
function texteRiche(xml: string): string {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => decoderXml(m[1] ?? "")).join("");
}

export class ErreurTableur extends Error {}

/** Lignes de la première feuille d'un .xlsx, en texte (cellules vides : ""). */
export function lireXlsx(octets: Uint8Array): string[][] {
  if (octets.length > LIMITES.octets) throw new ErreurTableur("Fichier trop lourd (2 Mo au plus).");
  let fichiers: Record<string, Uint8Array>;
  let total = 0;
  try {
    fichiers = unzipSync(octets, {
      filter: (f: UnzipFileInfo) => {
        if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(f.name)) return false;
        total += f.originalSize;
        if (f.originalSize > LIMITES.decompresse || total > LIMITES.decompresse) throw new ErreurTableur("Fichier trop volumineux une fois ouvert.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ErreurTableur) throw e;
    throw new ErreurTableur("Ce fichier n'est pas un classeur Excel (.xlsx) lisible.");
  }
  const lire = (nom: string) => (fichiers[nom] ? new TextDecoder("utf-8").decode(fichiers[nom]) : null);

  // Première feuille du classeur (ordre du classeur, pas du nom de fichier).
  let chemin = "xl/worksheets/sheet1.xml";
  const classeur = lire("xl/workbook.xml");
  const liens = lire("xl/_rels/workbook.xml.rels");
  const rid = classeur ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(classeur)?.[1] : null;
  if (rid && liens) {
    const cible = new RegExp(`<Relationship\\b[^>]*\\bId="${rid.replace(/[^A-Za-z0-9]/g, "")}"[^>]*\\bTarget="([^"]+)"`).exec(liens)?.[1] ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid.replace(/[^A-Za-z0-9]/g, "")}"`).exec(liens)?.[1];
    if (cible) {
      const c = cible.replace(/^\/?xl\//, "").replace(/^\//, "");
      if (/^worksheets\/[^/]+\.xml$/.test(c)) chemin = `xl/${c}`;
    }
  }
  const feuille = lire(chemin) ?? Object.keys(fichiers).filter((n) => n.startsWith("xl/worksheets/")).sort().map(lire)[0];
  if (!feuille) throw new ErreurTableur("Le classeur ne contient aucune feuille lisible.");
  const partages = [...(lire("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => texteRiche(m[1] ?? ""));

  const lignes: string[][] = [];
  for (const r of feuille.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(/\br="(\d+)"/.exec(r[1])?.[1] ?? lignes.length + 1);
    if (numero > LIMITES.lignes + 10) break;
    const cellules: string[] = [];
    let suivante = 0;
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const i = ref ? colonne(ref) : suivante;
      suivante = i + 1;
      if (i >= LIMITES.colonnes) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const corps = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corps)?.[1];
      let valeur = "";
      if (type === "s") valeur = partages[Number(v)] ?? "";
      else if (type === "inlineStr") valeur = texteRiche(/<is>([\s\S]*?)<\/is>/.exec(corps)?.[1] ?? "");
      else if (type === "b") valeur = v === "1" ? "VRAI" : "FAUX";
      else if (type === "e") valeur = "";
      else valeur = v !== undefined ? decoderXml(v) : "";
      while (cellules.length < i) cellules.push("");
      cellules[i] = valeur.trim();
    }
    while (lignes.length < numero - 1) lignes.push([]);
    lignes[numero - 1] = cellules;
  }
  return lignes;
}

/** Texte d'un CSV : UTF-8 (avec ou sans BOM), sinon Windows-1252 (CSV enregistré par Excel en français). */
export function decoderTexte(octets: Uint8Array): string {
  if (octets.length > LIMITES.octets) throw new ErreurTableur("Fichier trop lourd (2 Mo au plus).");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

/** CSV séparé par « ; » (Excel en français), « , » ou tabulation : le séparateur le plus fréquent de la première ligne. */
export function lireCsv(texte: string): string[][] {
  const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", ",", "\t"].map((s) => [s, premiere.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
      continue;
    }
    if (c === '"' && champ === "") guillemets = true;
    else if (c === sep) {
      ligne.push(champ.trim());
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ.trim());
      lignes.push(ligne);
      if (lignes.length > LIMITES.lignes + 10) break;
      ligne = [];
      champ = "";
    } else champ += c;
  }
  if (champ !== "" || ligne.length) {
    ligne.push(champ.trim());
    lignes.push(ligne);
  }
  return lignes.map((l) => l.slice(0, LIMITES.colonnes));
}

/** Un classeur .xlsx d'une feuille : la première ligne en gras, colonnes élargies. */
export function ecrireXlsx(lignes: string[][], nomFeuille = "Organisation", largeurs: number[] = []): Uint8Array {
  return ecrireClasseur([{ nom: nomFeuille, lignes, largeurs }]);
}

export type Feuille = { nom: string; lignes: string[][]; largeurs?: number[] };

/**
 * Un classeur .xlsx de plusieurs feuilles (la première ligne de chacune en gras, figée). La lecture (lireXlsx) ne
 * prend que la première feuille : un modèle met ses données en premier et son mode d'emploi ensuite.
 */
export function ecrireClasseur(feuilles: Feuille[]): Uint8Array {
  const ref = (i: number, j: number) => {
    let n = j + 1;
    let l = "";
    while (n > 0) {
      l = String.fromCharCode(65 + ((n - 1) % 26)) + l;
      n = Math.floor((n - 1) / 26);
    }
    return `${l}${i + 1}`;
  };
  const xmlFeuille = ({ lignes, largeurs = [] }: Feuille) => {
    const cols = largeurs.length ? `<cols>${largeurs.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${lignes
      .map((l, i) => `<row r="${i + 1}">${l.map((v, j) => `<c r="${ref(i, j)}" t="inlineStr"${i === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${echapperXml(v ?? "")}</t></is></c>`).join("")}</row>`)
      .join("")}</sheetData></worksheet>`;
  };
  const noms = feuilles.map((f, k) => echapperXml(f.nom.slice(0, 31).replace(/[\\/?*[\]:]/g, " ") || `Feuille ${k + 1}`));
  const fichiers: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${feuilles.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((nom, k) => `<sheet name="${nom}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
  };
  feuilles.forEach((f, k) => {
    fichiers[`xl/worksheets/sheet${k + 1}.xml`] = strToU8(xmlFeuille(f));
  });
  return zipSync(fichiers, { level: 6 });
}
