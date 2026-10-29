/** Fichier Word de la fiche de projet (29 octobre 2026) : le même contenu que la page imprimable. */
import "server-only";
import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { dateCourteAnnee, dateLongue } from "@/lib/dates";
import { montantTexte } from "@/lib/suivi";
import { LIBELLE_LETTRE, type Lettre } from "@/lib/raci";
import type { FicheProjet } from "@/lib/donnees/fiche-projet";
import { logoCouleurPng } from "@/lib/conseil-word";

const MARINE = "213E7D";
const POLICE = "Calibri";
const bord = { style: BorderStyle.SINGLE, size: 4, color: "C8C8C8" };
const bords = { top: bord, bottom: bord, left: bord, right: bord };
const sansBord = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const sansBords = { top: sansBord, bottom: sansBord, left: sansBord, right: sansBord, insideHorizontal: sansBord, insideVertical: sansBord };

const run = (t: string, o: { gras?: boolean; blanc?: boolean; taille?: number; italique?: boolean; couleur?: string } = {}) =>
  new TextRun({ text: t, bold: o.gras, italics: o.italique, color: o.blanc ? "FFFFFF" : (o.couleur ?? "1F1F1F"), size: o.taille ?? 20, font: POLICE });
const para = (enfants: TextRun[], o: { apres?: number; avant?: number; centre?: boolean } = {}) =>
  new Paragraph({ children: enfants, spacing: { after: o.apres ?? 80, before: o.avant ?? 0 }, alignment: o.centre ? AlignmentType.CENTER : undefined });
const texte = (t: string, o: { gras?: boolean; italique?: boolean; couleur?: string } = {}) => para([run(t, o)]);
const puce = (enfants: TextRun[]) => new Paragraph({ children: enfants, bullet: { level: 0 }, spacing: { after: 40 } });
const titre = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, keepLines: true, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t, bold: true, size: 26, color: MARINE, font: POLICE })] });
const sousTitre = (t: string) => new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: t, bold: true, size: 21, font: POLICE })] });
const vide = (t: string) => texte(t, { italique: true, couleur: "6B6862" });

function cellule(enfants: Paragraph[], largeur: number, o: { entete?: boolean; fond?: string } = {}) {
  return new TableCell({
    children: enfants,
    width: { size: largeur, type: WidthType.PERCENTAGE },
    borders: bords,
    shading: o.entete ? { type: ShadingType.CLEAR, color: "auto", fill: MARINE } : o.fond ? { type: ShadingType.CLEAR, color: "auto", fill: o.fond } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function tableau(entetes: string[], largeurs: number[], lignes: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule([para([run(e, { gras: true, blanc: true, taille: 18 })], { apres: 0 })], largeurs[i], { entete: true })) }),
      ...lignes.map((l) => new TableRow({ cantSplit: true, children: l.map((v, i) => cellule([para([run(v, { gras: i === 0, taille: 18 })], { apres: 0 })], largeurs[i])) })),
    ],
  });
}

const FOND_LETTRE: Record<Lettre, string> = { R: "DCE8F5", A: "FFF0CC", C: "F1EFEA", I: "FFFFFF" };

function tableauRaci(f: FicheProjet) {
  const n = f.raci.colonnes.length;
  const premiere = 34;
  const autre = Math.floor((100 - premiere) / n);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cellule([para([run("Activité / livrable", { gras: true, blanc: true, taille: 18 })], { apres: 0 })], premiere, { entete: true }),
          ...f.raci.colonnes.map((c, i) =>
            cellule([para([run(c.libelle, { gras: true, blanc: true, taille: 18 })], { apres: 0 }), ...(f.nomsRaci[i] ? [para([run(f.nomsRaci[i], { blanc: true, taille: 16 })], { apres: 0 })] : [])], autre, { entete: true }),
          ),
        ],
      }),
      ...f.raci.lignes.map(
        (l) =>
          new TableRow({
            cantSplit: true,
            children: [
              cellule([para([run(l.activite, { taille: 18 })], { apres: 0 })], premiere),
              ...f.raci.colonnes.map((_, i) => {
                const x = (l.lettres[i] ?? "") as Lettre | "";
                return cellule([para([run(x, { gras: true, taille: 20 })], { apres: 0, centre: true })], autre, { fond: x ? FOND_LETTRE[x] : undefined });
              }),
            ],
          }),
      ),
    ],
  });
}

export async function ficheProjetWord(f: FicheProjet, options: { logoPng?: Buffer } = {}): Promise<Buffer> {
  const logoPng = options.logoPng ?? logoCouleurPng() ?? undefined;
  const corps: (Paragraph | Table)[] = [];
  let numero = 0;
  const section = (t: string) => corps.push(titre(`${++numero}. ${t}`));

  // En-tête : titres à gauche, logo à droite.
  const enTete = [
    para([run("DIVISION PRODUCTIVITÉ ET ORGANISATION", { gras: true, taille: 22 })], { apres: 0 }),
    para([run("FICHE DE PROJET", { taille: 20, couleur: "6B6862" })], { apres: 120 }),
    para([run(`${f.projet.code} · `, { gras: true, taille: 32, couleur: MARINE }), run(f.projet.titre, { gras: true, taille: 32 })], { apres: 40 }),
    para([run([f.projet.programme, f.projet.division !== "DPO" ? `Division : ${f.projet.division}` : null].filter(Boolean).join(" · ") || "Sans programme", { taille: 20, couleur: "6B6862" })], { apres: 0 }),
  ];
  corps.push(
    logoPng
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: sansBords,
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: enTete, width: { size: 76, type: WidthType.PERCENTAGE }, borders: sansBords }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: logoPng, transformation: { width: 130, height: 51 } })] })], width: { size: 24, type: WidthType.PERCENTAGE }, borders: sansBords }),
              ],
            }),
          ],
        })
      : new Paragraph({ children: [] }),
  );
  if (!logoPng) corps.push(...enTete);
  corps.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  // Les faits en un tableau à deux colonnes.
  const faits: [string, string][] = [
    ["Statut", `${f.projet.statut}${f.projet.archive ? " (archivé)" : ""}`],
    ["Priorité", f.projet.priorite],
    ["Stratégique", f.projet.strategique ? "Oui (rapport au conseil)" : "Non"],
    ...(f.projet.sante ? [["Santé", f.projet.santeMotif ? `${f.projet.sante} : ${f.projet.santeMotif}` : f.projet.sante] as [string, string]] : []),
    ["Sponsor métier", f.personnes.sponsor ?? "—"],
    ["Chef de projet", f.personnes.chef ?? "—"],
    ...(f.personnes.referent ? [["Référent DPO", f.personnes.referent] as [string, string]] : []),
    ["Date d'entrée", dateLongue(f.dates.entree)],
    ["Fin prévue", `${dateLongue(f.dates.finPrevue)}${f.dates.finInitiale && f.dates.finInitiale !== f.dates.finPrevue ? ` (initialement le ${dateLongue(f.dates.finInitiale)})` : ""}`],
    ["Lancement prévu", dateLongue(f.dates.lancement)],
  ];
  corps.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: faits.map(([t, v]) => new TableRow({ cantSplit: true, children: [cellule([para([run(t, { gras: true, taille: 18 })], { apres: 0 })], 28, { fond: "F1EFEA" }), cellule([para([run(v, { taille: 18 })], { apres: 0 })], 72)] })),
    }),
  );

  if (f.projet.description || f.projet.justification) {
    section("Description");
    if (f.projet.description) corps.push(...f.projet.description.split(/\n+/).map((t) => texte(t)));
    if (f.projet.justification) corps.push(para([run("Justification de la demande : ", { gras: true }), run(f.projet.justification)]));
  }

  section("Objectifs et bénéfices attendus");
  corps.push(sousTitre("Objectifs"));
  if (f.objectifs.length) corps.push(...f.objectifs.map((o) => puce([run(o.libelle), ...(o.evaluation ? [run(` — ${o.evaluation}`, { gras: true })] : [])])));
  else corps.push(vide("Pas encore écrits."));
  corps.push(sousTitre("Bénéfices attendus"));
  if (f.benefices.length)
    corps.push(
      tableau(
        ["Bénéfice", "Indicateur", "Départ", "Cible", "Constaté"],
        [34, 24, 13, 13, 16],
        f.benefices.map((b) => [b.libelle, b.indicateur || "—", b.depart || "—", b.cible || "—", b.constate ? `${b.constate}${b.constateLe ? ` (${dateCourteAnnee(b.constateLe)})` : ""}` : "—"]),
      ),
    );
  else corps.push(vide("Pas encore écrits."));

  section("Organisation et répartition des tâches");
  corps.push(sousTitre("Équipe"));
  const equipe = [
    ...(f.personnes.sponsor ? [[f.personnes.sponsor, "sponsor métier"]] : []),
    ...(f.personnes.chef ? [[f.personnes.chef, "chef de projet"]] : []),
    ...(f.personnes.referent ? [[f.personnes.referent, "référent DPO"]] : []),
    ...f.personnes.membres.map((m) => [m.nom, [m.role, m.externe && !m.role.includes(m.externe) ? `(${m.externe})` : ""].filter(Boolean).join(" ")]),
  ];
  corps.push(...equipe.map(([n, r]) => puce([run(n, { gras: true }), ...(r ? [run(` — ${r}`)] : [])])));
  corps.push(sousTitre(`RACI${f.raciPropre ? " (adapté pour ce projet)" : ""}`));
  corps.push(tableauRaci(f));
  corps.push(texte(Object.entries(LIBELLE_LETTRE).map(([x, l]) => `${x} = ${l.toLowerCase()}`).join(" · "), { italique: true, couleur: "6B6862" }));

  section("Calendrier");
  if (f.dates.nbReports) {
    corps.push(texte(`La fin prévue a été déplacée ${f.dates.nbReports} fois${f.dates.finInitiale ? ` depuis le ${dateLongue(f.dates.finInitiale)}` : ""}.`));
    corps.push(...f.dates.reports.map((r) => puce([run(`${dateCourteAnnee(r.avant)} → ${dateCourteAnnee(r.apres)}`, { gras: true }), ...(r.motif ? [run(` : ${r.motif}`)] : [])])));
  }
  if (f.phases.length) corps.push(tableau(["Phase", "Début", "Fin prévue", "État"], [40, 18, 18, 24], f.phases.map((ph) => [ph.nom, dateCourteAnnee(ph.debut), dateCourteAnnee(ph.fin), ph.etat])));
  else corps.push(vide("Pas de phases définies."));

  section(`Livrables · ${f.avancement.livrablesValides} validé${f.avancement.livrablesValides > 1 ? "s" : ""} sur ${f.avancement.livrables}`);
  if (f.livrables.length)
    corps.push(
      tableau(
        ["Livrable", "Prévu le", "Responsable", "État", "Tâches faites"],
        [38, 13, 19, 18, 12],
        f.livrables.map((l) => [`${l.libelle}${l.phase ? ` · ${l.phase}` : ""}`, dateCourteAnnee(l.prevuLe), l.responsable ?? "—", `${l.etat}${l.enRetard ? " (en retard)" : ""}`, l.taches || "—"]),
      ),
    );
  else corps.push(vide("Aucun livrable."));

  section("Avancement");
  corps.push(
    texte(
      f.avancement.total
        ? `${f.avancement.faites} tâche${f.avancement.faites > 1 ? "s" : ""} faite${f.avancement.faites > 1 ? "s" : ""} sur ${f.avancement.total} ; ${f.avancement.ouvertes} ouverte${f.avancement.ouvertes > 1 ? "s" : ""}, dont ${f.avancement.enRetard} en retard et ${f.avancement.bloquees} bloquée${f.avancement.bloquees > 1 ? "s" : ""}.`
        : "Aucune tâche pour l'instant.",
    ),
  );

  section(`Risques ouverts · ${f.risques.length}`);
  if (f.risques.length) corps.push(tableau(["Risque", "Gravité", "Suivi par", "Réponse prévue"], [36, 12, 18, 34], f.risques.map((r) => [r.titre, r.gravite, r.responsable ?? "—", r.reponse || "—"])));
  else corps.push(vide("Aucun risque ouvert au registre."));
  if (f.risquesMaitrises) corps.push(texte(`Et ${f.risquesMaitrises} risque${f.risquesMaitrises > 1 ? "s" : ""} maîtrisé${f.risquesMaitrises > 1 ? "s" : ""}, sous surveillance.`, { italique: true, couleur: "6B6862" }));

  if (f.decisions.length) {
    section(`Décisions${f.nbDecisions > f.decisions.length ? ` · les ${f.decisions.length} dernières sur ${f.nbDecisions}` : ""}`);
    corps.push(...f.decisions.map((d) => puce([run(`${dateCourteAnnee(d.le)}${d.instance ? ` · ${d.instance}` : ""} : `, { gras: true }), run(d.texte)])));
  }

  if (f.budget) {
    section("Budget");
    const b = f.budget;
    corps.push(
      texte(
        `Prévu : ${b.prevu !== null ? montantTexte(b.prevu, b.devise) : "—"} · engagé : ${b.engage !== null ? montantTexte(b.engage, b.devise) : "—"}${b.part !== null ? ` (${b.part} %)` : ""}${b.majLe ? ` · mis à jour le ${dateCourteAnnee(b.majLe)}` : ""}`,
      ),
    );
    if (b.note) corps.push(texte(b.note, { italique: true, couleur: "6B6862" }));
  }

  if (f.cloture) {
    section("Clôture");
    corps.push(texte(`Clôturé le ${dateLongue(f.cloture.le)}${f.cloture.par ? ` par ${f.cloture.par}` : ""}. Objectifs : ${f.cloture.objectifs.toLowerCase() || "—"}.`));
    if (f.cloture.bilan) corps.push(para([run("Bilan : ", { gras: true }), run(f.cloture.bilan)]));
    if (f.cloture.lecons) corps.push(para([run("Leçons apprises : ", { gras: true }), run(f.cloture.lecons)]));
  }

  if (f.documents?.length) {
    section(`Documents · ${f.documents.length}`);
    corps.push(...f.documents.map((d) => puce([run(d.nom), run(` · ${d.categorie.toLowerCase()}`, { couleur: "6B6862" })])));
  }

  corps.push(new Paragraph({ spacing: { before: 360 }, children: [run(`Fiche éditée le ${dateLongue(f.editeLe)} par ${f.editePar}, depuis l'application Pilotage des projets. Elle reprend l'état du projet à cette date.`, { italique: true, taille: 16, couleur: "6B6862" })] }));

  const doc = new Document({
    creator: "Pilotage des projets DPO",
    title: `Fiche de projet · ${f.projet.code} · ${f.projet.titre}`,
    styles: { default: { document: { run: { font: POLICE, size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: corps }],
  });
  return Packer.toBuffer(doc);
}

/** Le nom du fichier : « fiche-projet-UR-2026-10-30.docx ». */
export const nomFichierFiche = (f: FicheProjet) => `fiche-projet-${f.projet.code.replace(/[^A-Za-z0-9]/g, "")}-${f.editeLe}.docx`;
