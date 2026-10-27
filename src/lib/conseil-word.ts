/** Fichier Word du rapport au conseil, sur le modèle du document habituel de la division. */
import "server-only";
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

export async function rapportConseilWord(lignes: LigneWord[], logoPng?: Buffer): Promise<Buffer> {
  const largeurs = [3, 22, 11, 24, 8, 8, 8, 8, 8];
  const entetes = ["", "Projet", "Programme", "État d'avancement", "Date d'entrée", "Date de fin prévue initialement", "Date de fin prévue au dernier rapport", "Nouvelle date de fin prévue", "Date prévisionnelle de lancement"];
  const rangees = [
    new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule([texte(e, { gras: true, blanc: true })], largeurs[i], true)) }),
    ...lignes.map(
      (l, i) =>
        new TableRow({
          children: [
            cellule([texte(String(i + 1))], largeurs[0]),
            cellule([texte(l.titre, { gras: true }), texte(l.description)], largeurs[1]),
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

  const enTete: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "DIVISION PRODUCTIVITÉ ET ORGANISATION", bold: true, size: 24, font: "Calibri" })] }),
    new Paragraph({ children: [new TextRun({ text: "PROJETS TECHNOLOGIQUES STRATÉGIQUES EN COURS", size: 22, font: "Calibri" })] }),
    new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "CALENDRIER DE LIVRAISON", bold: true, size: 22, font: "Calibri" })] }),
  ];
  if (logoPng) {
    enTete.unshift(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: logoPng, transformation: { width: 140, height: 55 } })] }));
  }

  const doc = new Document({
    creator: "Pilotage des projets DPO",
    title: "Projets technologiques stratégiques en cours",
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [...enTete, new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rangees })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
