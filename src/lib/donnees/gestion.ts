/**
 * Gestion des projets (demandes, décision, modification, équipe, indicateurs, archivage) et des
 * tâches (modification complète, réassignation, annulation, suppression). Règles : src/lib/projets.ts.
 * Les pages et les actions vérifient l'accès (src/lib/acces.ts) avant d'appeler ces fonctions.
 */
import "server-only";
import { priorite as lirePriorite } from "@/lib/suivi";
import { and, asc, count, eq, isNull, like, max, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { idsProjetsVisibles, type Acces } from "@/lib/acces";
import { noter } from "@/lib/journal";
import { aujourdhui } from "@/lib/dates";
import type { Cadrage } from "@/lib/cadrage";
import { chargerOrganisation, personneActuelle } from "@/lib/organisation";
import { codeSuggere, codeValide, motifReport, peutAssigner, reportExigeMotif, projetOuvert, projetSupprimable, STATUTS_ACCEPTES, tacheSupprimable, verifierChefEtReferent, type StatutProjet } from "@/lib/projets";
import { membresDeLaDirection, nomComplet, resoudreSuperieur } from "@/lib/regles";
import { trouverOuCreerExterne } from "./externes";
import { MESSAGE_HORS_LISTE, valeurDeListe } from "./listes";
import { finDeReference, noterReportFin } from "./reports-fin";
import { recalculerSante } from "./sante";

const date = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const texte = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export const acteur = (a: Acces) => ({ moiId: a.moi.id, suivis: a.suivis, projetsDiriges: a.projetsDiriges, directeur: a.directeur, toutVoir: a.toutVoir });

/**
 * On ne rattache une tâche qu'à un projet qu'on peut déjà voir (qu'on dirige, dont on est membre, et,
 * pour la direction et les exécutifs, de leur périmètre). Sans ce contrôle, se confier une tâche sur
 * n'importe quel projet y ferait entrer dans l'équipe du projet et en ouvrirait la lecture.
 */
async function projetAccessible(a: Acces, projetId: string): Promise<boolean> {
  const visibles = await idsProjetsVisibles(a);
  return visibles === "tous" || visibles.has(projetId);
}

async function codesPris(sauf?: string) {
  const lignes = await db.select({ id: schema.projets.id, code: schema.projets.code }).from(schema.projets);
  return lignes.filter((l) => l.id !== sauf).map((l) => l.code);
}

export async function suggestionDeCode(titre: string) {
  return codeSuggere(titre, await codesPris());
}

// ---------------------------------------------------------------------------
// Demandes de projet
// ---------------------------------------------------------------------------

export type DemandeProjet = { titre: string; description: string; justification: string; programme: string; strategique: boolean; finSouhaitee: string; chefSuggereId: string; code: string; division?: string; cadrage?: Cadrage | null };

/** Création directe par un exécutif : le statut de départ, le référent DPO, la date d'entrée (aujourd'hui si vide). */
export type CreationDirecte = { statut?: string; referentId?: string; dateEntree?: string };

/**
 * Proposer un projet : il naît en « Requête ». Les directeurs au-dessus de la personne (et les
 * exécutifs) sont prévenus ; l'un d'eux l'accepte ou la refuse.
 *
 * Un exécutif crée le projet directement (décidé le 29 octobre 2026) : avec `direct`, le projet naît accepté,
 * sans demande à valider ni alerte à la direction. Le chef de projet est alors obligatoire (et un référent DPO si
 * le chef est hors division), comme pour accepter une demande. L'appelant vérifie que la personne est exécutif.
 */
export async function proposerProjet(d: DemandeProjet, parId: string, direct?: CreationDirecte): Promise<{ id: string } | { erreur: string }> {
  const titre = texte(d.titre, 160);
  if (!titre) return { erreur: "Donnez un titre au projet." };
  const justification = texte(d.justification, 2000);
  if (!justification) return { erreur: "Dites en quelques lignes pourquoi ce projet est utile." };
  const pris = await codesPris();
  const code = d.code.trim() ? codeValide(d.code) : codeSuggere(titre, pris);
  if (!code) return { erreur: "Le code a 2 à 4 lettres ou chiffres." };
  if (pris.includes(code)) return { erreur: `Le code ${code} est déjà pris.` };
  // Programme et division : choisis dans les listes de référence (Organisation → Listes).
  const programme = await valeurDeListe("programme", d.programme);
  if (programme === null) return { erreur: MESSAGE_HORS_LISTE.programme };
  const division = await valeurDeListe("division", d.division);
  if (division === null) return { erreur: MESSAGE_HORS_LISTE.division };
  const org = await chargerOrganisation();
  // Un chef hors division tout juste créé (« Quelqu'un d'autre ») n'est pas encore dans l'organisation chargée.
  const chefP = d.chefSuggereId ? await personneActuelle(d.chefSuggereId) : null;
  const chefSuggere = chefP?.actif ? chefP.id : null;
  let statut: StatutProjet = "requete";
  let referent: string | null = null;
  if (direct) {
    if (!chefP?.actif) return { erreur: "Nommez le chef de projet." };
    const referentP = direct.referentId && direct.referentId !== chefP.id ? await personneActuelle(direct.referentId) : null;
    referent = referentP?.actif ? referentP.id : null;
    const incoherence = verifierChefEtReferent(chefP, referent ? referentP : null);
    if (incoherence) return { erreur: incoherence };
    statut = STATUTS_ACCEPTES.includes(direct.statut as StatutProjet) && direct.statut !== "finalise" ? (direct.statut as StatutProjet) : "en_cours";
  }
  const [p] = await db
    .insert(schema.projets)
    .values({
      code,
      titre,
      description: texte(d.description, 2000),
      programme,
      strategique: d.strategique,
      statut,
      chefProjetId: chefSuggere,
      referentId: referent,
      dateFinPrevue: date(d.finSouhaitee),
      dateFinInitiale: date(d.finSouhaitee),
      demandeParId: parId,
      demandeLe: new Date(),
      justification,
      division,
      cadrage: d.cadrage ?? null,
      ...(direct ? { dateEntree: date(direct.dateEntree) ?? aujourdhui(), decisionParId: parId, decisionLe: new Date(), motifDecision: "" } : {}),
    })
    .returning({ id: schema.projets.id });
  if (direct) {
    // Créé par un exécutif : le chef (s'il est de la division) et le référent sont prévenus ; personne n'a à décider.
    if (chefSuggere !== parId && !chefP!.externe) await db.insert(schema.notifications).values({ personneId: chefSuggere!, type: "projet", texte: `Vous êtes chef du projet « ${titre} »`, lien: `/projets/${p.id}` });
    if (referent && referent !== parId) await db.insert(schema.notifications).values({ personneId: referent, type: "projet", texte: `Vous êtes le référent DPO du projet « ${titre} »`, lien: `/projets/${p.id}` });
    await noter(parId, "projet_cree", p.id, { titre, code, statut });
    return { id: p.id };
  }
  // Les directeurs au-dessus du demandeur, et les exécutifs.
  const auteur = org.personnes.get(parId);
  const destinataires = [...org.personnes.values()].filter((x) => x.actif && x.id !== parId && (x.executif || (x.directeur && membresDeLaDirection(org, x.id).has(parId))));
  if (destinataires.length)
    await db.insert(schema.notifications).values(
      destinataires.map((x) => ({ personneId: x.id, type: "demande_projet", texte: `${auteur ? nomComplet(auteur) : "Quelqu'un"} propose un projet : « ${titre} »`, lien: `/projets/${p.id}` })),
    );
  await noter(parId, "projet_propose", p.id, { titre, code });
  return { id: p.id };
}

/**
 * Une demande décidée (acceptée ou refusée) ou supprimée n'attend plus personne : les alertes « … propose un projet »
 * envoyées aux directeurs et aux exécutifs disparaissent (29 octobre 2026). Le demandeur reçoit ensuite la décision.
 */
async function retirerAlertesDeDemande(projetId: string) {
  await db.delete(schema.notifications).where(and(eq(schema.notifications.type, "demande_projet"), eq(schema.notifications.lien, `/projets/${projetId}`)));
}

/** Accepter une demande : statut de départ, chef de projet, dates. Refuser : un motif. Le demandeur est prévenu. */
export async function deciderDemande(
  projetId: string,
  d: { accepte: boolean; motif: string; statut?: string; chefProjetId?: string; referentId?: string; division?: string; dateEntree?: string; dateFinPrevue?: string; strategique?: boolean },
  parId: string,
): Promise<{ ok: true } | { erreur: string }> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p || p.statut !== "requete") return { erreur: "Cette demande a déjà été traitée." };
  const motif = texte(d.motif, 1000);
  if (!d.accepte) {
    if (!motif) return { erreur: "Dites pourquoi la demande est refusée : le demandeur le lira." };
    await retirerAlertesDeDemande(projetId);
    await db.update(schema.projets).set({ statut: "refuse", decisionParId: parId, decisionLe: new Date(), motifDecision: motif, majLe: new Date() }).where(eq(schema.projets.id, projetId));
  } else {
    const org = await chargerOrganisation();
    const chefP = await personneActuelle(d.chefProjetId);
    const chef = chefP?.actif ? chefP.id : null;
    if (!chef) return { erreur: "Nommez le chef de projet." };
    const referentP = d.referentId && d.referentId !== chef ? await personneActuelle(d.referentId) : null;
    const referent = referentP?.actif ? referentP.id : null;
    const incoherence = verifierChefEtReferent(chefP, referent ? referentP : null);
    if (incoherence) return { erreur: incoherence };
    const statut = (STATUTS_ACCEPTES as string[]).includes(d.statut ?? "") ? (d.statut as StatutProjet) : "en_attente";
    const fin = date(d.dateFinPrevue) ?? p.dateFinPrevue;
    const division = d.division !== undefined ? await valeurDeListe("division", d.division, p.division) : p.division;
    if (division === null) return { erreur: MESSAGE_HORS_LISTE.division };
    await retirerAlertesDeDemande(projetId);
    await db
      .update(schema.projets)
      .set({
        statut: statut as typeof p.statut,
        chefProjetId: chef,
        referentId: referent,
        division,
        dateEntree: date(d.dateEntree) ?? p.dateEntree,
        dateFinPrevue: fin,
        dateFinInitiale: p.dateFinInitiale ?? fin,
        strategique: d.strategique ?? p.strategique,
        decisionParId: parId,
        decisionLe: new Date(),
        motifDecision: motif,
        majLe: new Date(),
      })
      .where(eq(schema.projets.id, projetId));
    if (chef !== parId && !chefP!.externe) await db.insert(schema.notifications).values({ personneId: chef, type: "projet", texte: `Vous êtes chef du projet « ${p.titre} »`, lien: `/projets/${projetId}` });
    if (referent && referent !== parId) await db.insert(schema.notifications).values({ personneId: referent, type: "projet", texte: `Vous êtes le référent DPO du projet « ${p.titre} »`, lien: `/projets/${projetId}` });
  }
  if (p.demandeParId && p.demandeParId !== parId)
    await db.insert(schema.notifications).values({
      personneId: p.demandeParId,
      type: "demande_projet",
      texte: d.accepte ? `Votre demande « ${p.titre} » est acceptée` : `Votre demande « ${p.titre} » est refusée : ${motif}`,
      lien: `/projets/${projetId}`,
    });
  await noter(parId, d.accepte ? "projet_accepte" : "projet_refuse", projetId, { motif });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Modification, archivage, suppression
// ---------------------------------------------------------------------------

export type ModifProjet = {
  code: string;
  titre: string;
  description: string;
  programme: string;
  strategique: boolean;
  statut: string;
  chefProjetId: string;
  referentId: string;
  division: string;
  dateEntree: string;
  dateFinInitiale: string;
  dateFinPrevue: string;
  dateLancementPrevue: string;
  /** Pourquoi la fin prévue est repoussée (obligatoire dans ce cas). */
  motifReport?: string;
  /** Sponsor métier (facultatif ; absent du formulaire : inchangé). */
  sponsorId?: string;
  /** Priorité (absente du formulaire : inchangée). */
  priorite?: string;
};

/** Les cases de la fiche de projet (type de solution, informations disponibles, spécialisations) : src/lib/cadrage.ts. */
export async function enregistrerCadrage(projetId: string, c: Cadrage, parId: string) {
  await db.update(schema.projets).set({ cadrage: c, majLe: new Date() }).where(eq(schema.projets.id, projetId));
  await noter(parId, "cadrage_modifie", projetId, c);
}

export async function modifierProjet(projetId: string, d: ModifProjet, parId: string): Promise<{ ok: true } | { erreur: string }> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return { erreur: "Projet introuvable." };
  const titre = texte(d.titre, 160);
  if (!titre) return { erreur: "Donnez un titre au projet." };
  const code = codeValide(d.code);
  if (!code) return { erreur: "Le code a 2 à 4 lettres ou chiffres." };
  if ((await codesPris(projetId)).includes(code)) return { erreur: `Le code ${code} est déjà pris.` };
  const org = await chargerOrganisation();
  const chefP = await personneActuelle(d.chefProjetId);
  const chef = chefP && (chefP.actif || chefP.id === p.chefProjetId) ? chefP.id : null;
  if (p.statut !== "requete" && p.statut !== "refuse" && !chef) return { erreur: "Un projet accepté a un chef de projet." };
  const referentP = d.referentId && d.referentId !== chef ? await personneActuelle(d.referentId) : null;
  const referent = referentP?.actif ? referentP.id : null;
  const incoherence = verifierChefEtReferent(chefP, referent ? referentP : null);
  if (incoherence && p.statut !== "requete" && p.statut !== "refuse") return { erreur: incoherence };
  // La demande et le refus se changent par la décision, pas par ce formulaire ; la fin d'un projet, par sa clôture
  // (un projet déjà finalisé garde ce statut ici : il se rouvre depuis sa fiche).
  const statutVoulu = (STATUTS_ACCEPTES as string[]).includes(d.statut) && d.statut !== "finalise" ? (d.statut as StatutProjet) : p.statut;
  const statut = p.statut === "requete" || p.statut === "refuse" || p.statut === "finalise" ? p.statut : statutVoulu;
  // Sponsor métier : une personne active, de la division ou d'ailleurs.
  let sponsorId = p.sponsorId;
  let sponsorP: Awaited<ReturnType<typeof personneActuelle>> = null;
  if (d.sponsorId !== undefined) {
    sponsorP = d.sponsorId ? await personneActuelle(d.sponsorId) : null;
    if (d.sponsorId && !sponsorP?.actif && d.sponsorId !== p.sponsorId) return { erreur: "Ce sponsor n'est plus actif." };
    sponsorId = sponsorP ? sponsorP.id : null;
  }
  const programme = await valeurDeListe("programme", d.programme, p.programme);
  if (programme === null) return { erreur: MESSAGE_HORS_LISTE.programme };
  const division = await valeurDeListe("division", d.division, p.division);
  if (division === null) return { erreur: MESSAGE_HORS_LISTE.division };
  const valeurs = {
    code,
    titre,
    description: texte(d.description, 2000),
    programme,
    strategique: d.strategique,
    statut: statut as typeof p.statut,
    chefProjetId: chef,
    referentId: referent,
    division,
    dateEntree: date(d.dateEntree),
    dateFinInitiale: date(d.dateFinInitiale),
    dateFinPrevue: date(d.dateFinPrevue),
    dateLancementPrevue: date(d.dateLancementPrevue),
    sponsorId,
    priorite: d.priorite === undefined ? p.priorite : lirePriorite(d.priorite),
    majLe: new Date(),
  };
  const motif = motifReport(d.motifReport);
  // Repousser la fin, ou l'effacer sur un projet accepté, demande un motif.
  const finEffacee = !!p.dateFinPrevue && !valeurs.dateFinPrevue && p.statut !== "requete" && p.statut !== "refuse";
  if (finEffacee && !motif) return { erreur: "Dites pourquoi la fin prévue est retirée : le motif est lu dans les glissements et dans le rapport au conseil." };
  if (reportExigeMotif(await finDeReference(p), valeurs.dateFinPrevue) && !motif) return { erreur: "Dites pourquoi la fin prévue est repoussée : le motif est lu dans les glissements et dans le rapport au conseil." };
  await db.update(schema.projets).set(valeurs).where(eq(schema.projets.id, projetId));
  await noterReportFin(projetId, p.dateFinPrevue, valeurs.dateFinPrevue, parId, motif);
  // Dates ou statut changés : la santé calculée suit.
  await recalculerSante([projetId]);
  if (chef && chef !== p.chefProjetId && chef !== parId && !chefP?.externe)
    await db.insert(schema.notifications).values({ personneId: chef, type: "projet", texte: `Vous êtes chef du projet « ${titre} »`, lien: `/projets/${projetId}` });
  if (referent && referent !== p.referentId && referent !== parId)
    await db.insert(schema.notifications).values({ personneId: referent, type: "projet", texte: `Vous êtes le référent DPO du projet « ${titre} »`, lien: `/projets/${projetId}` });
  if (sponsorId && sponsorId !== p.sponsorId && sponsorId !== parId && sponsorP && (!sponsorP.externe || sponsorP.acces))
    await db.insert(schema.notifications).values({ personneId: sponsorId, type: "projet", texte: `Vous êtes le sponsor métier du projet « ${titre} »`, lien: `/projets/${projetId}` });
  await noter(parId, "projet_modifie", projetId, { ...valeurs, majLe: undefined });
  return { ok: true };
}

/** Ce qui empêche de supprimer un projet (il s'archive alors). */
export async function activiteDuProjet(projetId: string) {
  const compte = async (
    table:
      | typeof schema.taches
      | typeof schema.lignesRapport
      | typeof schema.reponsesRapport
      | typeof schema.lignesConseil
      | typeof schema.historiqueProjet
      | typeof schema.reunions
      | typeof schema.documentsProjet
      | typeof schema.decisionsProjet
      | typeof schema.risquesProjet
      | typeof schema.reportsFinProjet,
  ) => {
    const [{ n }] = await db.select({ n: count() }).from(table).where(eq(table.projetId, projetId));
    return Number(n);
  };
  return {
    taches: await compte(schema.taches),
    lignesRapport: await compte(schema.lignesRapport),
    reponsesRapport: await compte(schema.reponsesRapport),
    lignesConseil: await compte(schema.lignesConseil),
    historique: await compte(schema.historiqueProjet),
    reunions: await compte(schema.reunions),
    documents: await compte(schema.documentsProjet),
    // Les registres comptent aussi (revue de sécurité du 29 octobre 2026) : un projet qui a des décisions, des risques,
    // des reports motivés ou un livrable validé s'archive au lieu de se supprimer.
    decisions: await compte(schema.decisionsProjet),
    risques: await compte(schema.risquesProjet),
    reportsFin: await compte(schema.reportsFinProjet),
    livrablesValides: Number((await db.select({ n: count() }).from(schema.indicateurs).where(and(eq(schema.indicateurs.projetId, projetId), eq(schema.indicateurs.etat, "atteint"))))[0].n),
  };
}

export async function archiverProjet(projetId: string, archiver: boolean, parId: string) {
  await db.update(schema.projets).set(archiver ? { archiveLe: new Date(), archiveParId: parId, majLe: new Date() } : { archiveLe: null, archiveParId: null, majLe: new Date() }).where(eq(schema.projets.id, projetId));
  await noter(parId, archiver ? "projet_archive" : "projet_desarchive", projetId);
}

/** Supprime un projet sans activité (sinon : refus, il faut l'archiver). */
export async function supprimerProjet(projetId: string, parId: string): Promise<{ ok: true } | { erreur: string }> {
  if (!projetSupprimable(await activiteDuProjet(projetId))) return { erreur: "Ce projet a une histoire (tâches, rapports, réunions, documents, décisions, risques ou reports) : archivez-le plutôt." };
  const [p] = await db.delete(schema.projets).where(eq(schema.projets.id, projetId)).returning({ titre: schema.projets.titre, code: schema.projets.code });
  // Plus de projet : ses alertes (demande, chef nommé…) ne mèneraient nulle part.
  await db.delete(schema.notifications).where(or(eq(schema.notifications.lien, `/projets/${projetId}`), like(schema.notifications.lien, `/projets/${projetId}/%`), like(schema.notifications.lien, `/projets/${projetId}#%`), like(schema.notifications.lien, `/projets/${projetId}?%`)));
  await noter(parId, "projet_supprime", projetId, p ?? {});
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Livrables (table « indicateurs »)
// ---------------------------------------------------------------------------

export type DonneesLivrable = { libelle: string; prevuLe: string | null; responsableId: string | null; critere: string; phaseId?: string | null };

/** La phase d'un livrable : une phase de ce projet, ou aucune. */
async function phaseDuProjet(projetId: string, phaseId: string | null | undefined): Promise<string | null> {
  if (!phaseId) return null;
  const [ph] = await db.select({ id: schema.phasesProjet.id }).from(schema.phasesProjet).where(and(eq(schema.phasesProjet.id, phaseId), eq(schema.phasesProjet.projetId, projetId)));
  return ph?.id ?? null;
}

/** Le responsable d'un livrable : une personne active ; il entre dans l'équipe du projet et il est prévenu. */
async function responsableValide(responsableId: string | null) {
  if (!responsableId) return { id: null as string | null };
  const p = await personneActuelle(responsableId);
  if (!p?.actif) return { erreur: "Ce responsable n'est plus actif." };
  return { id: p.id as string | null, personne: p };
}

async function prevenirResponsable(projetId: string, libelle: string, responsableId: string, parId: string) {
  const [pr] = await db.select({ titre: schema.projets.titre, code: schema.projets.code }).from(schema.projets).where(eq(schema.projets.id, projetId));
  const p = await personneActuelle(responsableId);
  await entrerDansLEquipe(projetId, responsableId, parId);
  if (responsableId === parId || !p || (p.externe && !p.acces)) return;
  await db.insert(schema.notifications).values({ personneId: responsableId, type: "projet", texte: `Vous êtes responsable du livrable « ${libelle} » (${pr?.code ?? "projet"}) : ses tâches sont à déterminer avec l'équipe du projet`, lien: `/projets/${projetId}#livrables` });
}

export async function ajouterLivrable(projetId: string, d: DonneesLivrable, parId: string): Promise<{ ok: true; id: string } | { erreur: string }> {
  const l = texte(d.libelle, 200);
  if (!l) return { erreur: "Donnez un nom au livrable." };
  const r = await responsableValide(d.responsableId);
  if ("erreur" in r) return { erreur: r.erreur! };
  const [{ m }] = await db.select({ m: max(schema.indicateurs.ordre) }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId));
  const [n] = await db
    .insert(schema.indicateurs)
    .values({ projetId, libelle: l, ordre: (m ?? 0) + 1, prevuLe: date(d.prevuLe), responsableId: r.id, critere: texte(d.critere, 500), phaseId: await phaseDuProjet(projetId, d.phaseId) })
    .returning({ id: schema.indicateurs.id });
  if (r.id) await prevenirResponsable(projetId, l, r.id, parId);
  await noter(parId, "livrable_ajoute", projetId, { libelle: l, responsable: r.id, prevuLe: date(d.prevuLe) });
  await recalculerSante([projetId]);
  return { ok: true, id: n.id };
}

/** Compatibilité : ajouter un livrable par son seul nom. */
export async function ajouterIndicateur(projetId: string, libelle: string, parId: string) {
  await ajouterLivrable(projetId, { libelle, prevuLe: null, responsableId: null, critere: "" }, parId);
}

export async function modifierLivrable(projetId: string, livrableId: string, d: DonneesLivrable, parId: string): Promise<{ ok: true } | { erreur: string }> {
  const [avant] = await db.select().from(schema.indicateurs).where(and(eq(schema.indicateurs.id, livrableId), eq(schema.indicateurs.projetId, projetId)));
  if (!avant) return { erreur: "Livrable introuvable." };
  const l = texte(d.libelle, 200);
  if (!l) return { erreur: "Donnez un nom au livrable." };
  const r = await responsableValide(d.responsableId);
  if ("erreur" in r) return { erreur: r.erreur! };
  const prevuLe = date(d.prevuLe);
  await db
    .update(schema.indicateurs)
    .set({ libelle: l, prevuLe, responsableId: r.id, critere: texte(d.critere, 500), ...(d.phaseId !== undefined ? { phaseId: await phaseDuProjet(projetId, d.phaseId) } : {}) })
    .where(eq(schema.indicateurs.id, livrableId));
  if (r.id && r.id !== avant.responsableId) await prevenirResponsable(projetId, l, r.id, parId);
  await noter(parId, "livrable_modifie", livrableId, { libelle: l !== avant.libelle ? l : undefined, prevuLe: prevuLe !== avant.prevuLe ? prevuLe : undefined, responsable: r.id !== avant.responsableId ? r.id : undefined });
  await recalculerSante([projetId]);
  return { ok: true };
}

export async function renommerIndicateur(projetId: string, indicateurId: string, libelle: string, parId: string) {
  const l = texte(libelle, 200);
  if (!l) return;
  await db.update(schema.indicateurs).set({ libelle: l }).where(and(eq(schema.indicateurs.id, indicateurId), eq(schema.indicateurs.projetId, projetId)));
  await noter(parId, "indicateur_renomme", indicateurId, { libelle: l });
}

export async function retirerIndicateur(projetId: string, indicateurId: string, parId: string) {
  await db.delete(schema.indicateurs).where(and(eq(schema.indicateurs.id, indicateurId), eq(schema.indicateurs.projetId, projetId)));
  const reste = await db.select({ id: schema.indicateurs.id }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId)).orderBy(asc(schema.indicateurs.ordre));
  for (const [i, x] of reste.entries()) await db.update(schema.indicateurs).set({ ordre: i + 1 }).where(eq(schema.indicateurs.id, x.id));
  await noter(parId, "indicateur_retire", indicateurId);
}

export async function deplacerIndicateur(projetId: string, indicateurId: string, sens: -1 | 1) {
  const liste = await db.select({ id: schema.indicateurs.id }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId)).orderBy(asc(schema.indicateurs.ordre));
  const i = liste.findIndex((x) => x.id === indicateurId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  for (const [k, x] of liste.entries()) await db.update(schema.indicateurs).set({ ordre: k + 1 }).where(eq(schema.indicateurs.id, x.id));
}

// ---------------------------------------------------------------------------
// Équipe projet
// ---------------------------------------------------------------------------

export async function membresDuProjet(projetId: string) {
  const org = await chargerOrganisation();
  const lignes = await db.select().from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projetId)).orderBy(asc(schema.membresProjet.ajouteLe));
  return lignes
    .map((m) => ({ ...m, personne: org.personnes.get(m.personneId) }))
    .filter((m) => m.personne)
    .map((m) => ({ id: m.id, personneId: m.personneId, role: m.role, nom: nomComplet(m.personne!), poste: m.personne!.poste, actif: m.personne!.actif, externe: m.personne!.externe, organisation: m.personne!.organisation }));
}

/** Les rôles déjà donnés dans les équipes projet, les plus utilisés d'abord : proposés pendant la saisie. */
export async function rolesDesEquipes(): Promise<string[]> {
  const lignes = await db
    .select({ role: schema.membresProjet.role, n: count() })
    .from(schema.membresProjet)
    .where(ne(schema.membresProjet.role, ""))
    .groupBy(schema.membresProjet.role);
  return lignes.sort((a, b) => b.n - a.n || a.role.localeCompare(b.role, "fr")).map((l) => l.role);
}

const plier = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Un rôle saisi : s'il existe déjà, aux accents, aux majuscules et aux espaces près, on reprend l'existant
 * (pas de « analyste » à côté d'« Analyste ») ; sinon c'est un nouveau rôle, avec une majuscule.
 */
export async function roleNormalise(saisi: string): Promise<string> {
  const r = texte(saisi, 80).replace(/\s+/g, " ");
  if (!r) return "";
  const existant = (await rolesDesEquipes()).find((x) => plier(x) === plier(r));
  return existant ?? r.charAt(0).toUpperCase() + r.slice(1);
}

export async function ajouterMembre(projetId: string, personneId: string, role: string, parId: string) {
  const personne = await personneActuelle(personneId);
  if (!personne?.actif) return;
  const [p] = await db.select({ titre: schema.projets.titre, chef: schema.projets.chefProjetId }).from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p || p.chef === personneId) return;
  const [n] = await db.insert(schema.membresProjet).values({ projetId, personneId, role: await roleNormalise(role), ajouteParId: parId }).onConflictDoNothing().returning({ id: schema.membresProjet.id });
  if (n && personneId !== parId && !personne.externe) await db.insert(schema.notifications).values({ personneId, type: "projet", texte: `Vous faites partie de l'équipe du projet « ${p.titre} »`, lien: `/projets/${projetId}` });
  if (n) await noter(parId, "membre_ajoute", projetId, { personne: personneId });
}

export async function changerRoleMembre(projetId: string, membreId: string, role: string, parId?: string) {
  const r = await roleNormalise(role);
  const [m] = await db.update(schema.membresProjet).set({ role: r }).where(and(eq(schema.membresProjet.id, membreId), eq(schema.membresProjet.projetId, projetId))).returning({ personneId: schema.membresProjet.personneId });
  if (m && parId) await noter(parId, "membre_role", projetId, { personne: m.personneId, role: r });
}

/** Retirer un membre : ses tâches ouvertes sur le projet restent à lui (le chef de projet les réassigne). */
export async function retirerMembre(projetId: string, membreId: string, parId: string) {
  const [m] = await db.delete(schema.membresProjet).where(and(eq(schema.membresProjet.id, membreId), eq(schema.membresProjet.projetId, projetId))).returning({ personneId: schema.membresProjet.personneId });
  if (m) await noter(parId, "membre_retire", projetId, { personne: m.personneId });
}

/** Le projet, son chef et les membres de son équipe (pour la règle d'assignation). */
export async function projetPourAssignation(projetId: string | null) {
  if (!projetId) return null;
  const [p] = await db
    .select({ id: schema.projets.id, chefProjetId: schema.projets.chefProjetId, referentId: schema.projets.referentId, statut: schema.projets.statut, archiveLe: schema.projets.archiveLe })
    .from(schema.projets)
    .where(eq(schema.projets.id, projetId));
  if (!p) return null;
  const membres = await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projetId));
  return { ...p, membres: new Set(membres.map((m) => m.id)) };
}

/**
 * Qui l'on peut choisir dans « Pour » : soi, les personnes suivies, et, par projet dirigé, son équipe.
 * Les personnes hors division : hors projet et sur un projet qu'on dirige (partout pour la direction).
 */
export async function assignables(a: Acces) {
  const org = await chargerOrganisation();
  // Hors division (accès limité) : on ne se confie une tâche qu'à soi-même.
  if (a.moi.externe) {
    const moi = org.personnes.get(a.moi.id)!;
    return { personnes: [{ id: moi.id, nom: "Moi", externe: false, organisation: moi.organisation }], base: [moi.id], parProjet: {} as Record<string, string[]>, parLivrable: {} as Record<string, string[]>, externes: [] as string[], externesPartout: false, horsProjet: false };
  }
  const actives = [...org.personnes.values()].filter((p) => p.actif);
  const base = actives.filter((p) => !p.externe && (p.id === a.moi.id || a.suivis === "toutes" || a.suivis.has(p.id))).map((p) => p.id);
  const externes = actives.filter((p) => p.externe).map((p) => p.id);
  // Hors division : seulement sur les projets qu'on dirige (ni hors projet, ni ailleurs).
  const externesPartout = false;
  const parProjet: Record<string, string[]> = {};
  for (const projetId of a.projetsDiriges) {
    const membres = await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projetId));
    parProjet[projetId] = [a.moi.id, ...membres.map((m) => m.id).filter((id) => org.personnes.get(id)?.actif)];
  }
  // Livrables dont on est responsable : on en confie les tâches à l'équipe du projet (chef, référent, membres).
  const parLivrable: Record<string, string[]> = {};
  const miens = await db
    .select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, chef: schema.projets.chefProjetId, referent: schema.projets.referentId })
    .from(schema.indicateurs)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.indicateurs.projetId))
    .where(and(eq(schema.indicateurs.responsableId, a.moi.id), ne(schema.indicateurs.etat, "atteint"), isNull(schema.projets.archiveLe)));
  for (const l of miens) {
    const membres = await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, l.projetId));
    parLivrable[l.id] = [...new Set([a.moi.id, l.chef, l.referent, ...membres.map((m) => m.id)])].filter((id): id is string => !!id && !!org.personnes.get(id)?.actif);
  }
  const ids = new Set([...base, ...Object.values(parProjet).flat(), ...Object.values(parLivrable).flat(), ...externes]);
  const personnes = [...ids]
    .map((id) => org.personnes.get(id)!)
    .sort((x, y) => Number(y.id === a.moi.id) - Number(x.id === a.moi.id) || Number(x.externe) - Number(y.externe) || x.nom.localeCompare(y.nom, "fr"))
    .map((p) => ({ id: p.id, nom: p.id === a.moi.id ? "Moi" : nomComplet(p), externe: p.externe, organisation: p.organisation }));
  return { personnes, base, parProjet, parLivrable, externes, externesPartout, horsProjet: false };
}

/** Assigner sur un projet fait entrer la personne dans l'équipe du projet (si elle n'y est pas). */
async function entrerDansLEquipe(projetId: string | null, personneId: string, parId: string) {
  if (!projetId) return;
  const [p] = await db.select({ chef: schema.projets.chefProjetId }).from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p || p.chef === personneId) return;
  await db.insert(schema.membresProjet).values({ projetId, personneId, ajouteParId: parId }).onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------

/** Nouvelle personne hors division saisie avec la tâche (« Quelqu'un d'autre ») : son nom et son département. */
export type NouvelExterne = { nom: string; organisation: string };

/** Crée la fiche hors division demandée, une fois la règle d'assignation vérifiée pour une personne hors division. */
async function assigneEffectif(a: Acces, d: { assigneId: string; nouvelExterne?: NouvelExterne | null }, projet: Awaited<ReturnType<typeof projetPourAssignation>>) {
  // Hors division (accès limité) : pas de tâche confiée à quelqu'un d'autre, pas de nouvelle fiche.
  if (a.moi.externe && (d.nouvelExterne || d.assigneId !== a.moi.id)) return { erreur: "Avec un accès limité, on ne se confie une tâche qu'à soi-même." };
  if (!d.nouvelExterne) return { id: d.assigneId };
  if (!peutAssigner(acteur(a), "", projet, true)) return { erreur: "Seul le chef du projet (ou son référent DPO) confie une tâche à une personne hors division, sur son projet." };
  if (!d.nouvelExterne.nom.trim()) return { erreur: "Donnez le nom de la personne hors division." };
  const id = await trouverOuCreerExterne(d.nouvelExterne.nom, d.nouvelExterne.organisation, a.moi.id);
  return id ? { id } : { erreur: "Donnez le nom de la personne hors division." };
}

/** Le livrable choisi pour une tâche : il doit être un livrable du projet de la tâche. */
async function livrablePourTache(livrableId: string | null | undefined, projetId: string | null) {
  if (!livrableId) return { livrable: null };
  const [l] = await db.select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, responsableId: schema.indicateurs.responsableId }).from(schema.indicateurs).where(eq(schema.indicateurs.id, livrableId));
  if (!l || l.projetId !== projetId) return { erreur: "Ce livrable n'est pas un livrable du projet choisi." };
  return { livrable: l };
}

export async function creerTacheGeree(
  a: Acces,
  d: { titre: string; description: string; projetId: string | null; assigneId: string; nouvelExterne?: NouvelExterne | null; echeance: string | null; debut: string | null; estimationHeures: number | null; reunionId?: string | null; livrableId?: string | null; priorite?: string | null },
): Promise<{ id: string } | { erreur: string }> {
  const titre = texte(d.titre, 200);
  if (!titre) return { erreur: "Donnez un titre à la tâche." };
  if (d.debut && d.echeance && d.debut > d.echeance) return { erreur: "Le début doit précéder l'échéance." };
  const projet = await projetPourAssignation(d.projetId);
  if (d.projetId && !projet) return { erreur: "Projet introuvable." };
  if (d.projetId && !(await projetAccessible(a, d.projetId))) return { erreur: "Projet introuvable." };
  if (projet && !projetOuvert(projet)) return { erreur: "Ce projet ne reçoit pas de tâches (demande, refusé, finalisé ou archivé)." };
  const lv = await livrablePourTache(d.livrableId, d.projetId);
  if ("erreur" in lv) return { erreur: lv.erreur! };
  const eff = await assigneEffectif(a, d, projet);
  if ("erreur" in eff) return { erreur: eff.erreur! };
  d = { ...d, assigneId: eff.id };
  const assigne = await personneActuelle(d.assigneId);
  if (!assigne?.actif) return { erreur: "Cette personne n'est plus active." };
  if (!peutAssigner(acteur(a), d.assigneId, projet, assigne.externe, lv.livrable)) return { erreur: "Vous ne pouvez pas confier une tâche à cette personne." };
  const [t] = await db
    .insert(schema.taches)
    .values({ titre, description: texte(d.description, 4000), projetId: d.projetId, assigneId: d.assigneId, echeance: d.echeance, debut: d.debut, estimationHeures: d.estimationHeures, creeParId: a.moi.id, reunionId: d.reunionId ?? null, livrableId: lv.livrable?.id ?? null, priorite: lirePriorite(d.priorite) })
    .returning({ id: schema.taches.id });
  await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: a.moi.id, type: "creation" });
  await entrerDansLEquipe(d.projetId, d.assigneId, a.moi.id);
  if (d.assigneId !== a.moi.id && (!assigne.externe || assigne.acces)) await db.insert(schema.notifications).values({ personneId: d.assigneId, type: "tache", texte: `${a.moi.prenom} ${a.moi.nom} vous a confié « ${titre} »`, lien: `/taches/${t.id}` });
  await noter(a.moi.id, "tache_creee", t.id, { assigne: d.assigneId, projet: d.projetId, livrable: lv.livrable?.id });
  if (lv.livrable) await recalculerSante([lv.livrable.projetId]);
  return { id: t.id };
}

/** Titre, description, projet, personne : la réassignation suit la règle d'assignation ; les deux personnes sont prévenues. */
export async function modifierDefinitionTache(
  a: Acces,
  tache: typeof schema.taches.$inferSelect,
  d: { titre: string; description: string; projetId: string | null; assigneId: string; nouvelExterne?: NouvelExterne | null; livrableId?: string | null; priorite?: string | null },
): Promise<{ ok: true } | { erreur: string }> {
  const titre = texte(d.titre, 200);
  if (!titre) return { erreur: "Donnez un titre à la tâche." };
  const projet = await projetPourAssignation(d.projetId);
  if (d.projetId && !projet) return { erreur: "Projet introuvable." };
  // Sans livrable dans le formulaire (ancien formulaire, barre) : on garde celui de la tâche s'il est du même projet.
  const livrableVoulu = d.livrableId === undefined ? (d.projetId === tache.projetId ? tache.livrableId : null) : d.livrableId;
  const lv = await livrablePourTache(livrableVoulu, d.projetId);
  if ("erreur" in lv) return { erreur: lv.erreur! };
  const eff = await assigneEffectif(a, d, projet);
  if ("erreur" in eff) return { erreur: eff.erreur! };
  d = { ...d, assigneId: eff.id };
  const prio = d.priorite === undefined ? tache.priorite : lirePriorite(d.priorite);
  const change = { titre: titre !== tache.titre, projet: d.projetId !== tache.projetId, assigne: d.assigneId !== tache.assigneId, livrable: (lv.livrable?.id ?? null) !== tache.livrableId, priorite: prio !== tache.priorite };
  if (change.projet && d.projetId && !(await projetAccessible(a, d.projetId))) return { erreur: "Projet introuvable." };
  if (change.projet && projet && !projetOuvert(projet)) return { erreur: "Ce projet ne reçoit pas de tâches (demande, refusé, finalisé ou archivé)." };
  const assigne = await personneActuelle(d.assigneId);
  if (change.assigne && !assigne?.actif) return { erreur: "Cette personne n'est plus active." };
  if ((change.assigne || change.projet) && !peutAssigner(acteur(a), d.assigneId, projet, !!assigne?.externe, lv.livrable)) return { erreur: "Vous ne pouvez pas confier cette tâche à cette personne." };
  await db.update(schema.taches).set({ titre, description: texte(d.description, 4000), projetId: d.projetId, assigneId: d.assigneId, livrableId: lv.livrable?.id ?? null, priorite: prio, majLe: new Date() }).where(eq(schema.taches.id, tache.id));
  // Une tâche qui se répète : les occurrences suivantes suivent la tâche (personne, projet, livrable, titre). La règle
  // passe à qui vient de la confier (il a passé la règle d'assignation) ; elle est revérifiée à chaque occurrence.
  if (tache.recurrenceId && !tache.annuleeLe)
    await db
      .update(schema.tachesRecurrentes)
      .set({
        titre,
        description: texte(d.description, 4000),
        projetId: d.projetId,
        assigneId: d.assigneId,
        livrableId: lv.livrable?.id ?? null,
        priorite: prio,
        ...(change.assigne || change.projet ? { creeParId: a.moi.id } : {}),
      })
      .where(and(eq(schema.tachesRecurrentes.id, tache.recurrenceId), isNull(schema.tachesRecurrentes.arreteeLe)));
  if (change.priorite) await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "priorite", avant: tache.priorite, apres: prio });
  if (change.livrable) await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "livrable", avant: tache.livrableId, apres: lv.livrable?.id ?? null });
  if (change.titre) await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "titre", avant: tache.titre, apres: titre });
  if (change.projet) {
    await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "projet", avant: tache.projetId, apres: d.projetId });
    // Une dépendance relie deux tâches du même projet : changer de projet les retire (sinon les titres et les
    // personnes de l'autre projet resteraient visibles depuis la tâche).
    await db.delete(schema.dependancesTache).where(or(eq(schema.dependancesTache.tacheId, tache.id), eq(schema.dependancesTache.precedenteId, tache.id)));
  }
  if (change.assigne) {
    // Lu en base : la personne peut avoir été ajoutée (hors division) dans cette même requête.
    const [nouveau] = await db.select({ prenom: schema.personnes.prenom, nom: schema.personnes.nom }).from(schema.personnes).where(eq(schema.personnes.id, d.assigneId));
    await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "assignation", avant: tache.assigneId, apres: d.assigneId, note: nouveau ? nomComplet(nouveau) : null });
    const notifs = [];
    if (d.assigneId !== a.moi.id) notifs.push({ personneId: d.assigneId, type: "tache", texte: `${a.moi.prenom} ${a.moi.nom} vous a confié « ${titre} »`, lien: `/taches/${tache.id}` });
    if (tache.assigneId !== a.moi.id) notifs.push({ personneId: tache.assigneId, type: "tache", texte: `« ${titre} » est maintenant confiée à ${nouveau ? nomComplet(nouveau) : "quelqu'un d'autre"}`, lien: null });
    if (notifs.length) await db.insert(schema.notifications).values(notifs);
  }
  if (change.assigne || change.projet) await entrerDansLEquipe(d.projetId, d.assigneId, a.moi.id);
  await noter(a.moi.id, "tache_definie", tache.id, change);
  if (change.livrable || change.projet) await recalculerSante([d.projetId, tache.projetId].filter((x): x is string => !!x));
  return { ok: true };
}

/** Ce que la tâche a déjà vécu : décide entre supprimer et annuler. */
export async function histoireDeTache(tacheId: string) {
  const ev = await db.select({ type: schema.evenementsTache.type }).from(schema.evenementsTache).where(eq(schema.evenementsTache.tacheId, tacheId));
  const [{ n }] = await db.select({ n: count() }).from(schema.lignesRapport).where(eq(schema.lignesRapport.tacheId, tacheId));
  return { evenements: ev.map((e) => e.type), lignesRapport: Number(n) };
}

export async function annulerTache(a: Acces, tache: typeof schema.taches.$inferSelect, motif: string): Promise<{ ok: true } | { erreur: string }> {
  const m = texte(motif, 500);
  if (!m) return { erreur: "Dites en une phrase pourquoi la tâche est annulée." };
  const maintenant = new Date();
  await db.update(schema.taches).set({ annuleeLe: maintenant, annuleeParId: a.moi.id, motifAnnulation: m, majLe: maintenant }).where(eq(schema.taches.id, tache.id));
  // Une tâche qui se répète : l'annuler arrête sa répétition (au même instant, pour que « Rétablir » la reprenne).
  if (tache.recurrenceId)
    await db
      .update(schema.tachesRecurrentes)
      .set({ arreteeLe: maintenant })
      .where(and(eq(schema.tachesRecurrentes.id, tache.recurrenceId), isNull(schema.tachesRecurrentes.arreteeLe)));
  await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "annulation", note: m });
  if (tache.assigneId !== a.moi.id) await db.insert(schema.notifications).values({ personneId: tache.assigneId, type: "tache", texte: `« ${tache.titre} » est annulée : ${m}`, lien: `/taches/${tache.id}` });
  await noter(a.moi.id, "tache_annulee", tache.id, { motif: m });
  return { ok: true };
}

export async function retablirTache(a: Acces, tache: typeof schema.taches.$inferSelect) {
  await db.update(schema.taches).set({ annuleeLe: null, annuleeParId: null, motifAnnulation: "", majLe: new Date() }).where(eq(schema.taches.id, tache.id));
  // La répétition arrêtée par cette annulation reprend.
  if (tache.recurrenceId && tache.annuleeLe)
    await db
      .update(schema.tachesRecurrentes)
      .set({ arreteeLe: null })
      .where(and(eq(schema.tachesRecurrentes.id, tache.recurrenceId), eq(schema.tachesRecurrentes.arreteeLe, tache.annuleeLe)));
  await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "retablie" });
  await noter(a.moi.id, "tache_retablie", tache.id);
}

/** Supprimer une tâche sans histoire (sinon : refus, il faut l'annuler). */
export async function supprimerTache(a: Acces, tache: typeof schema.taches.$inferSelect): Promise<{ ok: true } | { erreur: string }> {
  if (!tacheSupprimable({ statut: tache.statut, ...(await histoireDeTache(tache.id)) })) return { erreur: "Cette tâche a déjà une histoire : annulez-la plutôt." };
  await db.delete(schema.taches).where(eq(schema.taches.id, tache.id));
  // Supprimer une tâche qui se répète arrête sa répétition.
  if (tache.recurrenceId)
    await db
      .update(schema.tachesRecurrentes)
      .set({ arreteeLe: new Date() })
      .where(and(eq(schema.tachesRecurrentes.id, tache.recurrenceId), isNull(schema.tachesRecurrentes.arreteeLe)));
  await noter(a.moi.id, "tache_supprimee", tache.id, { titre: tache.titre });
  return { ok: true };
}

/** Demandes de projet en attente que cette personne peut voir, et celles qu'elle a faites. */
export async function demandesDeProjet(a: Acces, visibles: Set<string> | "tous") {
  const org = await chargerOrganisation();
  const lignes = await db.select().from(schema.projets).where(and(ne(schema.projets.statut, "en_cours"), isNull(schema.projets.archiveLe)));
  return lignes
    .filter((p) => (p.statut === "requete" || p.statut === "refuse") && (visibles === "tous" || visibles.has(p.id)))
    .map((p) => {
      const d = p.demandeParId ? org.personnes.get(p.demandeParId) : undefined;
      const sup = d ? resoudreSuperieur(org, d.id) : null;
      return { id: p.id, code: p.code, titre: p.titre, statut: p.statut, demandeLe: p.demandeLe, demandeur: d ? nomComplet(d) : null, demandeurId: p.demandeParId, superieur: sup ? nomComplet(sup) : null, motif: p.motifDecision };
    })
    .sort((x, y) => Number(x.statut === "refuse") - Number(y.statut === "refuse") || (y.demandeLe?.getTime() ?? 0) - (x.demandeLe?.getTime() ?? 0));
}
