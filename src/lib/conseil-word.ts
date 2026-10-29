/** Fichier Word du rapport au conseil, sur le modèle du document habituel de la division. */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { dateLongue } from "@/lib/dates";

/**
 * Logo couleur en PNG (public/logo-couleur.png, rendu depuis le SVG) : Word n'affiche pas le SVG partout.
 * Cherché à côté du serveur (image Docker, serveur autonome) puis dans le projet.
 */
let logoEnCache: Buffer | null | undefined;
export function logoCouleurPng(): Buffer | null {
  if (logoEnCache !== undefined) return logoEnCache;
  const candidats = [path.join(process.cwd(), "public", "logo-couleur.png"), path.join(process.cwd(), "..", "..", "public", "logo-couleur.png")];
  const trouve = candidats.find((f) => existsSync(f));
  logoEnCache = trouve ? readFileSync(trouve) : null;
  return logoEnCache;
}

const sansBord = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const sansBords = { top: sansBord, bottom: sansBord, left: sansBord, right: sansBord, insideHorizontal: sansBord, insideVertical: sansBord };

export type LigneWord = {
  titre: string;
  description: string;
  programme: string;
  etatAvancement: string;
  dateEntree: string | null;
  dateFinInitiale: string | null;
  dateFinDernierRapport: string | null;
  nouvelleDateFin: string | null;
  dateLancement: string | null;
  /** Les objectifs écrits du projet (29 octobre 2026), rappelés sous sa description. */
  objectifs?: string[];
};

const MARINE = "213E7D";
const bord = { style: BorderStyle.SINGLE, size: 4, color: "C8C8C8" };
const bords = { top: bord, bottom: bord, left: bord, right: bord };

function cellule(enfants: Paragraph[], largeur: number, entete = false) {
  return new TableCell({
    children: enfants,
    width: { size: largeur, type: WidthType.PERCENTAGE },
    borders: bords,
    shading: entete ? { type: ShadingType.CLEAR, color: "auto", fill: MARINE } : undefined,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
  });
}

const texte = (t: string, options: { gras?: boolean; blanc?: boolean } = {}) =>
  new Paragraph({ children: [new TextRun({ text: t, bold: options.gras, color: options.blanc ? "FFFFFF" : "1F1F1F", size: 18, font: "Calibri" })] });

/** En-tête d'un rapport ponctuel : son titre, sa date et sa période, la demande ou l'événement qui le motive. */
export type EnteteParticuliere = { titre: string; sousTitre: string; objet: string };

export async function rapportConseilWord(lignes: LigneWord[], options: { logoPng?: Buffer; ponctuel?: EnteteParticuliere } = {}): Promise<Buffer> {
  const { ponctuel } = options;
  const logoPng = options.logoPng ?? logoCouleurPng() ?? undefined;
  const largeurs = [3, 22, 11, 24, 8, 8, 8, 8, 8];
  const entetes = ["", "Projet", "Programme", "État d'avancement", "Date d'entrée", "Date de fin prévue initialement", "Date de fin prévue au dernier rapport", "Nouvelle date de fin prévue", "Date prévisionnelle de lancement"];
  const rangees = [
    new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule([texte(e, { gras: true, blanc: true })], largeurs[i], true)) }),
    ...lignes.map(
      (l, i) =>
        new TableRow({
          children: [
            cellule([texte(String(i + 1))], largeurs[0]),
            cellule([texte(l.titre, { gras: true }), texte(l.description), ...(l.objectifs?.length ? [new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: "Objectifs : ", bold: true, size: 16, font: "Calibri", color: "555555" }), new TextRun({ text: l.objectifs.join(" ; "), size: 16, font: "Calibri", color: "555555" })] })] : [])], largeurs[1]),
            cellule([texte(l.programme)], largeurs[2]),
            cellule(l.etatAvancement.split(/\n+/).map((p) => texte(p)), largeurs[3]),
            cellule([texte(dateLongue(l.dateEntree))], largeurs[4]),
            cellule([texte(dateLongue(l.dateFinInitiale))], largeurs[5]),
            cellule([texte(dateLongue(l.dateFinDernierRapport))], largeurs[6]),
            cellule([texte(dateLongue(l.nouvelleDateFin))], largeurs[7]),
            cellule([texte(dateLongue(l.dateLancement))], largeurs[8]),
          ],
        }),
    ),
  ];

  const enTete: Paragraph[] = ponctuel
    ? [
        new Paragraph({ children: [new TextRun({ text: "DIVISION PRODUCTIVITÉ ET ORGANISATION", bold: true, size: 24, font: "Calibri" })] }),
        new Paragraph({ children: [new TextRun({ text: ponctuel.titre.toUpperCase(), size: 22, font: "Calibri" })] }),
        new Paragraph({ spacing: { before: 120, after: ponctuel.objet ? 120 : 240 }, children: [new TextRun({ text: ponctuel.sousTitre, bold: true, size: 20, font: "Calibri" })] }),
        ...(ponctuel.objet
          ? ponctuel.objet
              .split(/\n+/)
              .map((t, i) => new Paragraph({ spacing: { after: 120 }, children: [...(i === 0 ? [new TextRun({ text: "Objet : ", bold: true, size: 20, font: "Calibri" })] : []), new TextRun({ text: t, size: 20, font: "Calibri" })] }))
          : []),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ]
    : [
        new Paragraph({ children: [new TextRun({ text: "DIVISION PRODUCTIVITÉ ET ORGANISATION", bold: true, size: 24, font: "Calibri" })] }),
        new Paragraph({ children: [new TextRun({ text: "PROJETS TECHNOLOGIQUES STRATÉGIQUES EN COURS", size: 22, font: "Calibri" })] }),
        new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "CALENDRIER DE LIVRAISON", bold: true, size: 22, font: "Calibri" })] }),
      ];
  // En-tête : les titres à gauche, le logo à droite (comme le document habituel), dans un tableau sans bordure.
  const haut: (Paragraph | Table)[] = logoPng
    ? [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: sansBords,
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: enTete, width: { size: 78, type: WidthType.PERCENTAGE }, borders: sansBords }),
                new TableCell({
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: logoPng, transformation: { width: 150, height: 59 } })] })],
                  width: { size: 22, type: WidthType.PERCENTAGE },
                  borders: sansBords,
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ]
    : enTete;

  const doc = new Document({
    creator: "Pilotage des projets DPO",
    title: ponctuel ? ponctuel.titre : "Projets technologiques stratégiques en cours",
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [...haut, new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rangees })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
