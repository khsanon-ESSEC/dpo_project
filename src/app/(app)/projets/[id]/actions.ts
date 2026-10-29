"use server";

import { peutGererProjet } from "@/lib/projets";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { mettreAJourIndicateur } from "@/lib/donnees/projets";
import { noterReportFin } from "@/lib/donnees/reports-fin";
import { recalculerSante, signalerRisque } from "@/lib/donnees/sante";
import { noter } from "@/lib/journal";
import { deposerDocuments, peutDeposerDocument, retirerDocument } from "@/lib/donnees/documents";
import { estCategorie } from "@/lib/documents";

/** Le chef du projet, le directeur de la direction concernée et les exécutifs peuvent modifier un projet. */
async function exigerDroitProjet(projetId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, projetId);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) throw new Error("Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs modifient ce projet.");
  return { u, p };
}

const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function changerIndicateur(projetId: string, indicateurId: string, form: FormData) {
  const { u } = await exigerDroitProjet(projetId);
  const etat = String(form.get("etat") ?? "");
  if (etat !== "a_venir" && etat !== "en_cours" && etat !== "atteint") return;
  const [i] = await db.select().from(schema.indicateurs).where(and(eq(schema.indicateurs.id, indicateurId), eq(schema.indicateurs.projetId, projetId)));
  if (!i) return;
  await mettreAJourIndicateur(indicateurId, etat);
  await noter(u.id, "indicateur", indicateurId, { etat });
  await recalculerSante([projetId]);
  revalidatePath(`/projets/${projetId}`);
}

/** Dates du projet. La santé n'est pas choisie : elle est calculée (src/lib/sante.ts), puis recalculée ici. */
export async function mettreAJourProjet(projetId: string, form: FormData) {
  const { u, p } = await exigerDroitProjet(projetId);
  const valeurs = {
    dateFinPrevue: date(form.get("dateFinPrevue")) ?? p.dateFinPrevue,
    dateLancementPrevue: date(form.get("dateLancementPrevue")),
    majLe: new Date(),
  };
  await db.update(schema.projets).set(valeurs).where(eq(schema.projets.id, projetId));
  await noterReportFin(projetId, p.dateFinPrevue, valeurs.dateFinPrevue, u.id);
  await noter(u.id, "projet_modifie", projetId, { ...valeurs, majLe: undefined });
  await recalculerSante([projetId]);
  revalidatePath(`/projets/${projetId}`);
}

/**
 * Signaler un risque que les données ne montrent pas (un prestataire qui lâche, un budget gelé), ou le retirer :
 * le projet passe « à surveiller » pendant 30 jours ; un signal ne rend jamais un projet meilleur que le calcul.
 */
export async function signalerUnRisque(projetId: string, form: FormData) {
  const { u } = await exigerDroitProjet(projetId);
  const retirer = form.get("retirer") === "1";
  const motif = retirer ? "" : String(form.get("motif") ?? "");
  if (!retirer && !motif.trim()) return;
  await signalerRisque(projetId, motif, u.id);
  await noter(u.id, retirer ? "risque_retire" : "risque_signale", projetId, retirer ? {} : { motif: motif.trim().slice(0, 300) });
  revalidatePath(`/projets/${projetId}`);
}

/** Joindre des documents au projet (cahier des charges, spécification, compte rendu…). */
export async function deposerDocumentsProjet(projetId: string, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, projetId);
  const retour = (q: string): never => redirect(`/projets/${projetId}?${q}#documents`);
  if (!(await peutDeposerDocument(a, p))) retour(`doc=${encodeURIComponent("Seuls l'équipe du projet et ceux qui le gèrent y ajoutent des documents.")}`);
  const brut = form.get("categorie");
  const categorie = estCategorie(brut) ? brut : "autre";
  const fichiers = form.getAll("fichiers").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x && (x as File).size > 0);
  if (!fichiers.length) retour(`doc=${encodeURIComponent("Choisissez au moins un fichier.")}`);
  const r = await deposerDocuments(a, p.id, categorie, fichiers.slice(0, 10));
  revalidatePath(`/projets/${projetId}`);
  retour(r.erreurs.length ? `doc=${encodeURIComponent(r.erreurs.join(" "))}${r.deposes ? `&docOk=${r.deposes}` : ""}` : `docOk=${r.deposes}`);
}

/** Retirer un document : qui l'a déposé, ou qui gère le projet. */
export async function retirerDocumentProjet(projetId: string, documentId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, projetId);
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return;
  const erreur = await retirerDocument(a, p, documentId);
  revalidatePath(`/projets/${projetId}`);
  redirect(`/projets/${projetId}?${erreur ? `doc=${encodeURIComponent(erreur)}` : "docRetire=1"}#documents`);
}
