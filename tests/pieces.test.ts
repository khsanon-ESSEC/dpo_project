import { describe, expect, it } from "vitest";
import { dispositionTelechargement, nomPropre, TAILLE_MAX, tailleLisible, verifierFichier } from "@/lib/pieces";

const octets = (...b: number[]) => new Uint8Array([...b, ...new Array(32).fill(0x20)]);
const enc = (s: string) => [...new TextEncoder().encode(s)];
/** Une archive qui ressemble à un document Office : en-tête ZIP, puis les noms de ses parties en clair. */
const office = (...parties: string[]) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("[Content_Types].xml"), ...parties.flatMap(enc), ...new Array(32).fill(0)]);
const utf16 = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);

describe("pièces jointes", () => {
  it("accepte un PDF, une image, un fichier Office, un CSV", () => {
    expect(verifierFichier("compte-rendu.pdf", octets(0x25, 0x50, 0x44, 0x46, 0x2d))).toMatchObject({ ok: true, type: "application/pdf" });
    expect(verifierFichier("capture.PNG", octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toMatchObject({ ok: true, type: "image/png" });
    expect(verifierFichier("budget.xlsx", office("xl/workbook.xml"))).toMatchObject({ ok: true, libelle: "Excel" });
    expect(verifierFichier("note.docx", office("word/document.xml"))).toMatchObject({ ok: true, libelle: "Word" });
    expect(verifierFichier("liste.csv", new TextEncoder().encode("nom;montant\nA;12\n"))).toMatchObject({ ok: true, type: "text/csv" });
  });
  it("refuse une archive quelconque renommée en Office, un document du mauvais type, un document à macros", () => {
    expect(verifierFichier("budget.xlsx", octets(0x50, 0x4b, 0x03, 0x04)).ok).toBe(false);
    expect(verifierFichier("budget.xlsx", office("word/document.xml")).ok).toBe(false);
    expect(verifierFichier("note.docx", office("word/document.xml", "word/vbaProject.bin")).ok).toBe(false);
    expect(verifierFichier("ancien.doc", octets(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)).ok).toBe(true);
    expect(verifierFichier("ancien.doc", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...utf16("_VBA_PROJECT"), 0, 0])).ok).toBe(false);
  });
  it("nom de fichier : sans caractère de sens d'écriture ni invisible ; en-tête de téléchargement encodé", () => {
    expect(nomPropre("facture\u202Efdp.exe")).toBe("facturefdp.exe");
    expect(nomPropre("a\u200Bb.pdf")).toBe("ab.pdf");
    expect(dispositionTelechargement("l'état (v2)*.pdf")).toContain("filename*=UTF-8''l%27%C3%A9tat%20%28v2%29%2A.pdf");
  });
  it("refuse un exécutable renommé, un format inconnu, un fichier vide ou trop gros", () => {
    expect(verifierFichier("facture.pdf", octets(0x4d, 0x5a, 0x90, 0x00)).ok).toBe(false);
    expect(verifierFichier("script.exe", octets(0x4d, 0x5a)).ok).toBe(false);
    expect(verifierFichier("page.html", new TextEncoder().encode("<html>")).ok).toBe(false);
    expect(verifierFichier("vide.txt", new Uint8Array()).ok).toBe(false);
    expect(verifierFichier("gros.txt", new Uint8Array(TAILLE_MAX + 1).fill(0x41)).ok).toBe(false);
    expect(verifierFichier("binaire.txt", new Uint8Array([0x41, 0x00, 0x42])).ok).toBe(false);
  });
  it("nettoie le nom et l'en-tête de téléchargement", () => {
    expect(nomPropre("C:\\Users\\moi\\Procédure \"v2\".pdf")).toBe("Procédure v2.pdf");
    expect(nomPropre("../../etc/passwd")).toBe("passwd");
    expect(dispositionTelechargement("Procédure v2.pdf")).toBe(`attachment; filename="Procedure v2.pdf"; filename*=UTF-8''Proc%C3%A9dure%20v2.pdf`);
    expect(tailleLisible(846)).toBe("846 o");
    expect(tailleLisible(1_300_000)).toBe("1,2 Mo");
  });
});
