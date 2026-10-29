"use server";

import { motifReport, peutGererProjet, reportExigeMotif } from "@/lib/projets";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { agirSurLivrable, livrableEtProjet, type ActionLivrable } from "@/lib/donnees/livrables";
import { modifierDecision, noterDecision, retirerDecision } from "@/lib/donnees/decisions";
import { ajouterPhase, changerStatutRisque, deplacerPhase, enregistrerRisque, modifierPhase, retirerPhase, retirerRisque, terminerPhase, utiliserPhasesTypes } from "@/lib/donnees/risques";
import { noterReportFin } from "@/lib/donnees/reports-fin";
import { cloturerProjet, enregistrerBudget, rouvrirProjet } from "@/lib/donnees/cloture";
import { lireMontant } from "@/lib/suivi";
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

/**
 * Livrable : le responsable le déclare prêt à valider ; qui gère le projet le valide, le renvoie à reprendre
 * (avec une remarque) ou le rouvre. Les droits sont vérifiés dans agirSurLivrable.
 */
export async function agirLivrable(projetId: string, livrableId: string, action: ActionLivrable, form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, projetId);
  if (!["pret", "valider", "renvoyer", "rouvrir"].includes(action)) return;
  const l = await livrableEtProjet(livrableId);
  if (!l || l.projet.id !== projetId) redirect(`/projets/${projetId}?erreur=${encodeURIComponent("Livrable introuvable.")}#livrables`);
  const r = await agirSurLivrable(a, livrableId, action, String(form.get("remarque") ?? ""));
  revalidatePath(`/projets/${projetId}`, "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#livrable-${livrableId}`);
  redirect(`/projets/${projetId}?livrable=${action}#livrable-${livrableId}`);
}

/** Dates du projet. La santé n'est pas choisie : elle est calculée (src/lib/sante.ts), puis recalculée ici. */
export async function mettreAJourProjet(projetId: string, form: FormData) {
  const { u, p } = await exigerDroitProjet(projetId);
  const valeurs = {
    dateFinPrevue: date(form.get("dateFinPrevue")) ?? p.dateFinPrevue,
    dateLancementPrevue: date(form.get("dateLancementPrevue")),
    majLe: new Date(),
  };
  // Repousser la fin demande un motif.
  const motif = motifReport(form.get("motifReport"));
  if (reportExigeMotif(p.dateFinPrevue, valeurs.dateFinPrevue) && !motif)
    redirect(`/projets/${projetId}?erreur=${encodeURIComponent("Dites pourquoi la fin est repoussée : le motif est lu dans les glissements et dans le rapport au conseil.")}`);
  await db.update(schema.projets).set(valeurs).where(eq(schema.projets.id, projetId));
  await noterReportFin(projetId, p.dateFinPrevue, valeurs.dateFinPrevue, u.id, motif);
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

// ---------- Registre des décisions ----------

const donneesDecision = (form: FormData) => ({
  texte: String(form.get("texte") ?? ""),
  decideeLe: String(form.get("decideeLe") ?? ""),
  instance: String(form.get("instance") ?? ""),
  contexte: String(form.get("contexte") ?? ""),
});

async function exigerVisible(projetId: string) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, projetId);
  return a;
}

const apresDecision = (projetId: string, r: { erreur: string } | { ok: true }, fait: string): never => {
  revalidatePath(`/projets/${projetId}`);
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#decisions`);
  redirect(`/projets/${projetId}?decision=${fait}#decisions`);
};

export async function noterUneDecision(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  apresDecision(projetId, await noterDecision(a, projetId, donneesDecision(form)), "notee");
}

export async function corrigerDecision(projetId: string, decisionId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  apresDecision(projetId, await modifierDecision(a, projetId, decisionId, donneesDecision(form)), "corrigee");
}

export async function retirerUneDecision(projetId: string, decisionId: string) {
  const a = await exigerVisible(projetId);
  apresDecision(projetId, await retirerDecision(a, projetId, decisionId), "retiree");
}

// ---------- Registre des risques ----------

const donneesRisque = (form: FormData) => ({
  titre: String(form.get("titre") ?? ""),
  description: String(form.get("description") ?? ""),
  probabilite: String(form.get("probabilite") ?? "2"),
  impact: String(form.get("impact") ?? "2"),
  responsableId: /^[0-9a-f-]{36}$/.test(String(form.get("responsableId") ?? "")) ? String(form.get("responsableId")) : null,
  reponse: String(form.get("reponse") ?? ""),
  revueLe: String(form.get("revueLe") ?? "") || null,
});

const apresRisque = (projetId: string, r: { erreur: string } | { ok: true }, fait: string, ancre = "risques"): never => {
  revalidatePath(`/projets/${projetId}`, "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#${ancre}`);
  redirect(`/projets/${projetId}?risque=${fait}#${ancre}`);
};

export async function enregistrerUnRisque(projetId: string, risqueId: string | null, form: FormData) {
  const a = await exigerVisible(projetId);
  const r = await enregistrerRisque(a, projetId, risqueId, donneesRisque(form));
  apresRisque(projetId, r, risqueId ? "modifie" : "note", "id" in r ? `risque-${r.id}` : "risques");
}

export async function statutDuRisque(projetId: string, risqueId: string, statut: string) {
  const a = await exigerVisible(projetId);
  apresRisque(projetId, await changerStatutRisque(a, projetId, risqueId, statut), statut, `risque-${risqueId}`);
}

export async function retirerUnRisque(projetId: string, risqueId: string) {
  const a = await exigerVisible(projetId);
  apresRisque(projetId, await retirerRisque(a, projetId, risqueId), "retire");
}

// ---------- Phases ----------

const apresPhase = (projetId: string, r: { erreur: string } | { ok: true }, depuis: "fiche" | "modifier"): never => {
  revalidatePath(`/projets/${projetId}`, "layout");
  const base = depuis === "fiche" ? `/projets/${projetId}` : `/projets/${projetId}/modifier`;
  if ("erreur" in r) redirect(`${base}?erreur=${encodeURIComponent(r.erreur)}#phases`);
  redirect(`${base}#phases`);
};
const donneesPhase = (form: FormData) => ({ nom: String(form.get("nom") ?? ""), debut: String(form.get("debut") ?? "") || null, fin: String(form.get("fin") ?? "") || null });

export async function ajouterUnePhase(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await ajouterPhase(a, projetId, donneesPhase(form)), "modifier");
}
export async function phasesTypes(projetId: string) {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await utiliserPhasesTypes(a, projetId), "modifier");
}
export async function modifierUnePhase(projetId: string, phaseId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await modifierPhase(a, projetId, phaseId, donneesPhase(form)), "modifier");
}
export async function terminerUnePhase(projetId: string, phaseId: string, terminee: boolean, depuis: "fiche" | "modifier") {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await terminerPhase(a, projetId, phaseId, terminee), depuis);
}
export async function retirerUnePhase(projetId: string, phaseId: string) {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await retirerPhase(a, projetId, phaseId), "modifier");
}
export async function deplacerUnePhase(projetId: string, phaseId: string, sens: -1 | 1) {
  const a = await exigerVisible(projetId);
  apresPhase(projetId, await deplacerPhase(a, projetId, phaseId, sens), "modifier");
}

// ---------- Clôture et budget (lot 4) ----------

export async function cloturerLeProjet(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  const r = await cloturerProjet(a, projetId, { clotureLe: date(form.get("clotureLe")), bilan: String(form.get("bilan") ?? ""), objectifs: String(form.get("objectifs") ?? ""), lecons: String(form.get("lecons") ?? "") });
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#cloture`);
  redirect(`/projets/${projetId}?cloture=faite#cloture`);
}

export async function rouvrirLeProjet(projetId: string) {
  const a = await exigerVisible(projetId);
  const r = await rouvrirProjet(a, projetId);
  revalidatePath("/", "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#cloture`);
  redirect(`/projets/${projetId}?cloture=rouvert`);
}

export async function enregistrerLeBudget(projetId: string, form: FormData) {
  const a = await exigerVisible(projetId);
  const lire = (nom: string) => {
    const v = String(form.get(nom) ?? "").trim();
    return v ? lireMontant(v) : null;
  };
  const prevu = lire("prevu");
  const engage = lire("engage");
  const illisible = (String(form.get("prevu") ?? "").trim() && prevu === null) || (String(form.get("engage") ?? "").trim() && engage === null);
  const r = illisible ? { erreur: "Montant illisible : écrivez par exemple « 2 500 000 » ou « 2,5 M »." } : await enregistrerBudget(a, projetId, { prevu, engage, devise: String(form.get("devise") ?? ""), note: String(form.get("note") ?? "") });
  revalidatePath(`/projets/${projetId}`, "layout");
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#budget`);
  redirect(`/projets/${projetId}?budget=enregistre#budget`);
}
