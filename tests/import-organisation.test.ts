/**
 * Importer l'organisation : lecture des fichiers (xlsx, CSV), comparaison avec l'existant, annuaire, puis
 * application contre la base de démonstration (TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { decoderTexte, ecrireXlsx, ErreurTableur, lireCsv, lireXlsx } from "@/lib/tableur";
import { ENTETES, lireLignes, planifierImport, type Existant, type LigneImport } from "@/lib/import-organisation";
import { dnDans, ligneDepuisAnnuaire } from "@/lib/auth/ad-regles";
import type * as DbModule from "@/db";
import type * as ImportModule from "@/lib/donnees/import-organisation";

describe("lire un tableau", () => {
  it("xlsx écrit puis relu : accents, caractères spéciaux, cellules vides", () => {
    const t = [ENTETES, ["Fabienne", "Michel", "f.michel@exemple.ht", "Analyste <senior> & co", "", "m.valcin@exemple.ht"]];
    expect(lireXlsx(ecrireXlsx(t))).toEqual(t);
  });
  it("xlsx d'Excel : chaînes partagées, texte mis en forme, nombres, feuille choisie par le classeur", () => {
    const fichier = zipSync({
      "xl/workbook.xml": strToU8(`<workbook xmlns:r="r"><sheets><sheet name="Personnes" sheetId="1" r:id="rId7"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/sheet2.xml"/></Relationships>`),
      "xl/sharedStrings.xml": strToU8(`<sst><si><t>Prénom</t></si><si><r><rPr><b/></rPr><t>Cour</t></r><r><t>riel</t></r></si><si><t xml:space="preserve"> Joël </t></si><si><t>j&amp;d@exemple.ht</t></si></sst>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>mauvaise feuille</t></is></c></row></sheetData></worksheet>`),
      "xl/worksheets/sheet2.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s" s="2"><v>2</v></c><c r="B3"><v>40</v></c><c r="C3" t="s"><v>3</v></c></row></sheetData></worksheet>`),
    });
    expect(lireXlsx(fichier)).toEqual([["Prénom", "", "Courriel"], [], ["Joël", "40", "j&d@exemple.ht"]]);
  });
  it("un fichier qui n'est pas un classeur : message clair", () => {
    expect(() => lireXlsx(strToU8("PK pas un zip"))).toThrow(ErreurTableur);
  });
  it("CSV d'Excel en français : point-virgule, guillemets, BOM, Windows-1252", () => {
    expect(lireCsv('Prénom;Nom;Courriel\n"Marie; Ange";"Saint-Fort";ms@exemple.ht\r\n')).toEqual([["Prénom", "Nom", "Courriel"], ["Marie; Ange", "Saint-Fort", "ms@exemple.ht"]]);
    expect(lireCsv("Prénom,Nom\nA,\"B \"\"C\"\"\"")).toEqual([["Prénom", "Nom"], ["A", 'B "C"']]);
    expect(decoderTexte(new Uint8Array([0xef, 0xbb, 0xbf, 0x45, 0xcc, 0x81])).normalize("NFC")).toBe("É");
    expect(lireLignes([["Courriel", "Prénom"], ["a@x.ht", "Rene\u0301"]])).toMatchObject({ lignes: [{ prenom: "René" }] });
    expect(decoderTexte(new Uint8Array([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d]))).toBe("Prénom"); // Windows-1252
  });
});

describe("colonnes reconnues", () => {
  it("en-têtes en français ou en anglais, dans n'importe quel ordre, lignes vides ignorées", () => {
    const r = lireLignes([["Liste du personnel"], ["E-mail", "First name", "Last name", "Fonction", "Service", "Manager"], ["A.B@Exemple.ht", "A", "B", "Chef", "DPO", "c@exemple.ht"], ["", "", ""]]);
    expect(r).toEqual({ lignes: [{ ligne: 3, prenom: "A", nom: "B", courriel: "a.b@exemple.ht", poste: "Chef", equipe: "DPO", superieur: "c@exemple.ht" }] });
  });
  it("sans colonne Courriel : refus expliqué", () => {
    expect(lireLignes([["Nom", "Prénom"], ["A", "B"]])).toHaveProperty("erreur");
  });
});

const L = (n: number, courriel: string, o: Partial<LigneImport> = {}): LigneImport => ({ ligne: n, prenom: "", nom: "", courriel, poste: "", equipe: "", superieur: "", ...o });
const EXISTANT: Existant = {
  equipes: [{ id: "e-po", nom: "Projets organisationnels" }],
  personnes: [
    { id: "p-mv", prenom: "Myriam", nom: "Valcin", courriel: "mv@x.ht", poste: "Cheffe", equipeId: "e-po", superieurId: "p-na", externe: false, actif: true },
    { id: "p-na", prenom: "Nadège", nom: "Augustin", courriel: "na@x.ht", poste: "Directrice", equipeId: null, superieurId: null, externe: false, actif: true },
    { id: "p-fm", prenom: "Fabienne", nom: "Michel", courriel: "fm@x.ht", poste: "Analyste", equipeId: "e-po", superieurId: "p-mv", externe: false, actif: true },
    { id: "p-nc", prenom: "Nathalie", nom: "Célestin", courriel: "nc@x.ht", poste: "", equipeId: null, superieurId: null, externe: true, actif: true },
    { id: "p-old", prenom: "Ancien", nom: "Agent", courriel: "old@x.ht", poste: "", equipeId: null, superieurId: null, externe: false, actif: false },
  ],
};

describe("ce que l'import changerait", () => {
  it("ajoute, met à jour, laisse le reste ; une case vide ne change rien ; équipe reconnue sans accents ni majuscules", () => {
    const p = planifierImport(
      [
        L(2, "nouveau@x.ht", { prenom: "Jean", nom: "Neuf", poste: "Analyste", equipe: "Nouvelle équipe", superieur: "mv@x.ht" }),
        L(3, "fm@x.ht", { poste: "Analyste senior", equipe: "projets ORGANISATIONNELS" }),
        L(4, "mv@x.ht", { prenom: "Myriam", nom: "" }),
      ],
      EXISTANT,
    );
    expect(p.erreurs).toEqual([]);
    expect(p.creer.map((l) => l.courriel)).toEqual(["nouveau@x.ht"]);
    expect(p.modifier.map(({ donnees, ...m }) => ({ ...m, poste: donnees.poste }))).toEqual([{ ligne: 3, id: "p-fm", courriel: "fm@x.ht", nom: "Fabienne Michel", changements: [{ champ: "poste", avant: "Analyste", apres: "Analyste senior" }], poste: "Analyste senior" }]);
    expect(p.inchanges).toBe(1);
    expect(p.equipesNouvelles).toEqual(["Nouvelle équipe"]);
    expect(p.absents).toBe(1); // Nadège : rien ne change pour elle
  });
  it("le supérieur peut être une personne ajoutée par le même fichier", () => {
    const p = planifierImport([L(2, "b@x.ht", { prenom: "B", nom: "B", superieur: "a@x.ht" }), L(3, "a@x.ht", { prenom: "A", nom: "A", superieur: "na@x.ht" })], EXISTANT);
    expect(p.erreurs).toEqual([]);
    expect(p.creer).toHaveLength(2);
  });
  it("erreurs : doublon, adresse illisible, nom manquant, hors division, fiche désactivée, supérieur introuvable ou soi-même", () => {
    const p = planifierImport(
      [
        L(2, "a@x.ht", { prenom: "A", nom: "A" }),
        L(3, "a@x.ht", { prenom: "A", nom: "A" }),
        L(4, "pas une adresse"),
        L(5, "c@x.ht", { prenom: "C" }),
        L(6, "nc@x.ht", { poste: "Consultante" }),
        L(7, "old@x.ht", { poste: "Retour" }),
        L(8, "d@x.ht", { prenom: "D", nom: "D", superieur: "inconnu@x.ht" }),
        L(9, "e@x.ht", { prenom: "E", nom: "E", superieur: "e@x.ht" }),
        L(10, "f@x.ht", { prenom: "F", nom: "F", superieur: "nc@x.ht" }),
      ],
      EXISTANT,
    );
    expect(p.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("une boucle de supérieurs est refusée (avec l'organisation telle qu'elle serait après l'import)", () => {
    // Nadège sous Fabienne, alors que Fabienne est sous Myriam, elle-même sous Nadège.
    const p = planifierImport([L(2, "na@x.ht", { superieur: "fm@x.ht" })], EXISTANT);
    expect(p.erreurs).toHaveLength(1);
    expect(p.erreurs[0].message).toMatch(/Boucle de supérieurs/);
  });
});

describe("import depuis l'annuaire : laisser de côté plutôt que bloquer", () => {
  it("un compte hors division ou sans nom est écarté, et celui dont il était le supérieur aussi ; le reste s'importe", () => {
    const p = planifierImport(
      [
        L(1, "nc@x.ht", { prenom: "Nathalie", nom: "Célestin" }), // hors division dans l'application
        L(2, "sans.nom@x.ht"), // nouvelle personne sans nom
        L(3, "sous@x.ht", { prenom: "Sous", nom: "Fifre", superieur: "sans.nom@x.ht" }), // son supérieur est écarté
        L(4, "ok@x.ht", { prenom: "Bon", nom: "Compte", superieur: "na@x.ht" }),
      ],
      EXISTANT,
      { laisserDeCote: true },
    );
    expect(p.erreurs).toEqual([]);
    expect(p.creer.map((l) => l.courriel)).toEqual(["ok@x.ht"]);
    expect(p.ignores.map((i) => i.courriel)).toEqual(["nc@x.ht", "sans.nom@x.ht", "sous@x.ht"]);
  });
});

describe("annuaire", () => {
  it("unité d'organisation : seulement sous la base, sans caractères de filtre", () => {
    expect(dnDans("OU=DPO, DC=unibank,DC=local", "DC=unibank,DC=local")).toBe(true);
    expect(dnDans("OU=DPO,DC=autre,DC=local", "DC=unibank,DC=local")).toBe(false);
    expect(dnDans("OU=x)(objectClass=*,DC=unibank,DC=local", "DC=unibank,DC=local")).toBe(false);
    expect(dnDans("DC=local", "DC=unibank,DC=local")).toBe(false);
  });
  it("un compte devient une ligne : adresse, nom affiché, service, supérieur par son DN", () => {
    const sup = (dn: string) => (dn === "CN=Nadège,OU=DPO" ? { mail: "NA@x.ht" } : null);
    expect(ligneDepuisAnnuaire({ mail: "", userPrincipalName: "jdupont@x.ht", displayName: "Jean Du Pont", title: "Analyste", department: "DPO", manager: "CN=Nadège,OU=DPO" }, sup, 1, true)).toEqual({
      ligne: 1,
      prenom: "Jean",
      nom: "Du Pont",
      courriel: "jdupont@x.ht",
      poste: "Analyste",
      equipe: "DPO",
      superieur: "na@x.ht",
    });
    expect(ligneDepuisAnnuaire({ givenName: "A", sn: "B", mail: "a@x.ht", department: "DPO" }, sup, 2, false)?.equipe).toBe("");
    expect(ligneDepuisAnnuaire({ givenName: "Sans", sn: "Adresse" }, sup, 3, true)).toBeNull();
  });
});

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("appliquer un import (base de démonstration)", () => {
  let D: typeof DbModule;
  let I: typeof ImportModule;
  let adminId = "";
  const personne = async (courriel: string) => (await D.db.select().from(D.schema.personnes).where(eq(D.schema.personnes.courriel, courriel)))[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    I = await import("@/lib/donnees/import-organisation");
    adminId = (await personne("jean-robert.noel@demo.dpo.local")).id;
  });
  afterAll(async () => {
    await D.db.execute(sql`update personnes set superieur_id = null where courriel in ('essai.import1@demo.dpo.local', 'essai.import2@demo.dpo.local')`);
    await D.db.delete(D.schema.personnes).where(sql`${D.schema.personnes.courriel} like 'essai.import%'`);
    await D.db.delete(D.schema.equipes).where(eq(D.schema.equipes.nom, "Équipe importée"));
    await globalThis.__pgClient?.end();
  });

  it("le modèle reprend l'organisation actuelle ; le réimporter ne change rien", async () => {
    const t = await I.tableauOrganisation();
    expect(t.length).toBeGreaterThan(10);
    const r = lireLignes([ENTETES, ...t]);
    if ("erreur" in r) throw new Error(r.erreur);
    const plan = await I.planPourLignes(r.lignes);
    expect(plan.erreurs).toEqual([]);
    expect(plan.creer.length + plan.modifier.length + plan.equipesNouvelles.length).toBe(0);
  });

  it("ajoute deux personnes (l'une supérieure de l'autre), une équipe, met un poste à jour ; rôles intacts", async () => {
    const avant = await personne("daphnee.joseph@demo.dpo.local");
    const lignes: LigneImport[] = [
      L(2, "essai.import2@demo.dpo.local", { prenom: "Deux", nom: "Essai", poste: "Analyste", equipe: "Équipe importée", superieur: "essai.import1@demo.dpo.local" }),
      L(3, "essai.import1@demo.dpo.local", { prenom: "Un", nom: "Essai", poste: "Chef", equipe: "Équipe importée", superieur: "nadege.augustin@demo.dpo.local" }),
      L(4, "daphnee.joseph@demo.dpo.local", { poste: "Chargée de projets senior" }),
    ];
    const r = await I.appliquerImport(adminId, lignes, "fichier");
    expect(r.ok).toBe(true);
    const un = await personne("essai.import1@demo.dpo.local");
    const deux = await personne("essai.import2@demo.dpo.local");
    expect(deux.superieurId).toBe(un.id);
    expect(un.motDePasseHash).toBeNull();
    expect(un.administrateur || un.directeur || un.executif).toBe(false);
    expect(un.equipeId).toBe(deux.equipeId);
    const d = await personne("daphnee.joseph@demo.dpo.local");
    expect(d.poste).toBe("Chargée de projets senior");
    expect({ ...d, poste: avant.poste, majLe: avant.majLe }).toEqual(avant);
    // Une seconde fois : rien ne change.
    const encore = await I.appliquerImport(adminId, lignes, "fichier");
    expect(encore.ok && encore.plan.creer.length + encore.plan.modifier.length).toBe(0);
  });

  it("une erreur : rien n'est importé", async () => {
    const r = await I.appliquerImport(adminId, [L(2, "essai.import3@demo.dpo.local", { prenom: "Trois", nom: "Essai" }), L(3, "pas-une-adresse")], "fichier");
    expect(r.ok).toBe(false);
    expect(await personne("essai.import3@demo.dpo.local")).toBeUndefined();
  });
});

describe("revue : la ligne appliquée est celle que le plan a validée", () => {
  it("chaque mise à jour porte sa propre ligne (jamais retrouvée par son numéro)", () => {
    const p = planifierImport([L(2, "fm@x.ht", { poste: "Senior" }), L(2, "nc@x.ht", { poste: "Consultante", superieur: "fm@x.ht" })], EXISTANT, { laisserDeCote: true });
    expect(p.modifier).toHaveLength(1);
    expect(p.modifier[0].donnees).toMatchObject({ courriel: "fm@x.ht", poste: "Senior" });
    expect(p.ignores.map((i) => i.courriel)).toEqual(["nc@x.ht"]);
  });
});
