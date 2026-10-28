/**
 * Gestion des projets (demandes, décision, modification, équipe, indicateurs, archivage) et des
 * tâches (modification complète, réassignation, annulation, suppression). Règles : src/lib/projets.ts.
 * Les pages et les actions vérifient l'accès (src/lib/acces.ts) avant d'appeler ces fonctions.
 */
import "server-only";
import { and, asc, count, eq, isNull, max, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { idsProjetsVisibles, type Acces } from "@/lib/acces";
import { noter } from "@/lib/journal";
import { chargerOrganisation, personneActuelle } from "@/lib/organisation";
import { codeSuggere, codeValide, peutAssigner, projetOuvert, projetSupprimable, STATUTS_ACCEPTES, tacheSupprimable, verifierChefEtReferent, type StatutProjet } from "@/lib/projets";
import { membresDeLaDirection, nomComplet, resoudreSuperieur } from "@/lib/regles";
import { trouverOuCreerExterne } from "./externes";

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

export type DemandeProjet = { titre: string; description: string; justification: string; programme: string; strategique: boolean; finSouhaitee: string; chefSuggereId: string; code: string; division?: string };

/**
 * Proposer un projet : il naît en « Requête ». Les directeurs au-dessus de la personne (et les
 * exécutifs) sont prévenus ; l'un d'eux l'accepte ou la refuse.
 */
export async function proposerProjet(d: DemandeProjet, parId: string): Promise<{ id: string } | { erreur: string }> {
  const titre = texte(d.titre, 160);
  if (!titre) return { erreur: "Donnez un titre au projet." };
  const justification = texte(d.justification, 2000);
  if (!justification) return { erreur: "Dites en quelques lignes pourquoi ce projet est utile." };
  const pris = await codesPris();
  const code = d.code.trim() ? codeValide(d.code) : codeSuggere(titre, pris);
  if (!code) return { erreur: "Le code a 2 à 4 lettres ou chiffres." };
  if (pris.includes(code)) return { erreur: `Le code ${code} est déjà pris.` };
  const org = await chargerOrganisation();
  const chefSuggere = d.chefSuggereId && org.personnes.get(d.chefSuggereId)?.actif ? d.chefSuggereId : null;
  const [p] = await db
    .insert(schema.projets)
    .values({
      code,
      titre,
      description: texte(d.description, 2000),
      programme: texte(d.programme, 160),
      strategique: d.strategique,
      statut: "requete",
      chefProjetId: chefSuggere,
      dateFinPrevue: date(d.finSouhaitee),
      dateFinInitiale: date(d.finSouhaitee),
      demandeParId: parId,
      demandeLe: new Date(),
      justification,
      division: texte(d.division, 120),
    })
    .returning({ id: schema.projets.id });
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
    await db
      .update(schema.projets)
      .set({
        statut: statut as typeof p.statut,
        chefProjetId: chef,
        referentId: referent,
        division: d.division !== undefined ? texte(d.division, 120) : p.division,
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
  sante: string;
  chefProjetId: string;
  referentId: string;
  division: string;
  dateEntree: string;
  dateFinInitiale: string;
  dateFinPrevue: string;
  dateLancementPrevue: string;
};

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
  // La demande et le refus se changent par la décision, pas par ce formulaire.
  const statut = p.statut === "requete" || p.statut === "refuse" ? p.statut : (STATUTS_ACCEPTES as string[]).includes(d.statut) ? (d.statut as StatutProjet) : p.statut;
  const sante = ["dans_les_temps", "a_surveiller", "en_retard"].includes(d.sante) ? (d.sante as typeof p.sante) : p.sante;
  const valeurs = {
    code,
    titre,
    description: texte(d.description, 2000),
    programme: texte(d.programme, 160),
    strategique: d.strategique,
    statut: statut as typeof p.statut,
    sante,
    chefProjetId: chef,
    referentId: referent,
    division: texte(d.division, 120),
    dateEntree: date(d.dateEntree),
    dateFinInitiale: date(d.dateFinInitiale),
    dateFinPrevue: date(d.dateFinPrevue),
    dateLancementPrevue: date(d.dateLancementPrevue),
    majLe: new Date(),
  };
  await db.update(schema.projets).set(valeurs).where(eq(schema.projets.id, projetId));
  if (chef && chef !== p.chefProjetId && chef !== parId && !chefP?.externe)
    await db.insert(schema.notifications).values({ personneId: chef, type: "projet", texte: `Vous êtes chef du projet « ${titre} »`, lien: `/projets/${projetId}` });
  if (referent && referent !== p.referentId && referent !== parId)
    await db.insert(schema.notifications).values({ personneId: referent, type: "projet", texte: `Vous êtes le référent DPO du projet « ${titre} »`, lien: `/projets/${projetId}` });
  await noter(parId, "projet_modifie", projetId, { ...valeurs, majLe: undefined });
  return { ok: true };
}

/** Ce qui empêche de supprimer un projet (il s'archive alors). */
export async function activiteDuProjet(projetId: string) {
  const compte = async (table: typeof schema.taches | typeof schema.lignesRapport | typeof schema.reponsesRapport | typeof schema.lignesConseil | typeof schema.historiqueProjet | typeof schema.reunions) => {
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
  };
}

export async function archiverProjet(projetId: string, archiver: boolean, parId: string) {
  await db.update(schema.projets).set(archiver ? { archiveLe: new Date(), archiveParId: parId, majLe: new Date() } : { archiveLe: null, archiveParId: null, majLe: new Date() }).where(eq(schema.projets.id, projetId));
  await noter(parId, archiver ? "projet_archive" : "projet_desarchive", projetId);
}

/** Supprime un projet sans activité (sinon : refus, il faut l'archiver). */
export async function supprimerProjet(projetId: string, parId: string): Promise<{ ok: true } | { erreur: string }> {
  if (!projetSupprimable(await activiteDuProjet(projetId))) return { erreur: "Ce projet a une histoire (tâches, rapports ou réunions) : archivez-le plutôt." };
  const [p] = await db.delete(schema.projets).where(eq(schema.projets.id, projetId)).returning({ titre: schema.projets.titre, code: schema.projets.code });
  await noter(parId, "projet_supprime", projetId, p ?? {});
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Indicateurs vérifiables
// ---------------------------------------------------------------------------

export async function ajouterIndicateur(projetId: string, libelle: string, parId: string) {
  const l = texte(libelle, 200);
  if (!l) return;
  const [{ m }] = await db.select({ m: max(schema.indicateurs.ordre) }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projetId));
  await db.insert(schema.indicateurs).values({ projetId, libelle: l, ordre: (m ?? 0) + 1 });
  await noter(parId, "indicateur_ajoute", projetId, { libelle: l });
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

export async function ajouterMembre(projetId: string, personneId: string, role: string, parId: string) {
  const personne = await personneActuelle(personneId);
  if (!personne?.actif) return;
  const [p] = await db.select({ titre: schema.projets.titre, chef: schema.projets.chefProjetId }).from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p || p.chef === personneId) return;
  const [n] = await db.insert(schema.membresProjet).values({ projetId, personneId, role: texte(role, 80), ajouteParId: parId }).onConflictDoNothing().returning({ id: schema.membresProjet.id });
  if (n && personneId !== parId && !personne.externe) await db.insert(schema.notifications).values({ personneId, type: "projet", texte: `Vous faites partie de l'équipe du projet « ${p.titre} »`, lien: `/projets/${projetId}` });
  if (n) await noter(parId, "membre_ajoute", projetId, { personne: personneId });
}

export async function changerRoleMembre(projetId: string, membreId: string, role: string) {
  await db.update(schema.membresProjet).set({ role: texte(role, 80) }).where(and(eq(schema.membresProjet.id, membreId), eq(schema.membresProjet.projetId, projetId)));
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
    return { personnes: [{ id: moi.id, nom: "Moi", externe: false, organisation: moi.organisation }], base: [moi.id], parProjet: {} as Record<string, string[]>, externes: [] as string[], externesPartout: false, horsProjet: false };
  }
  const actives = [...org.personnes.values()].filter((p) => p.actif);
  const base = actives.filter((p) => !p.externe && (p.id === a.moi.id || a.suivis === "toutes" || a.suivis.has(p.id))).map((p) => p.id);
  const externes = actives.filter((p) => p.externe).map((p) => p.id);
  const externesPartout = a.directeur || a.toutVoir;
  const parProjet: Record<string, string[]> = {};
  for (const projetId of a.projetsDiriges) {
    const membres = await db.select({ id: schema.membresProjet.personneId }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projetId));
    parProjet[projetId] = [a.moi.id, ...membres.map((m) => m.id).filter((id) => org.personnes.get(id)?.actif)];
  }
  const ids = new Set([...base, ...Object.values(parProjet).flat(), ...externes]);
  const personnes = [...ids]
    .map((id) => org.personnes.get(id)!)
    .sort((x, y) => Number(y.id === a.moi.id) - Number(x.id === a.moi.id) || Number(x.externe) - Number(y.externe) || x.nom.localeCompare(y.nom, "fr"))
    .map((p) => ({ id: p.id, nom: p.id === a.moi.id ? "Moi" : nomComplet(p), externe: p.externe, organisation: p.organisation }));
  return { personnes, base, parProjet, externes, externesPartout, horsProjet: true };
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
  if (!peutAssigner(acteur(a), "", projet, true)) return { erreur: "Sur ce projet, seuls son chef (ou son référent) et la direction confient une tâche à une personne hors division." };
  if (!d.nouvelExterne.nom.trim()) return { erreur: "Donnez le nom de la personne hors division." };
  const id = await trouverOuCreerExterne(d.nouvelExterne.nom, d.nouvelExterne.organisation, a.moi.id);
  return id ? { id } : { erreur: "Donnez le nom de la personne hors division." };
}

export async function creerTacheGeree(
  a: Acces,
  d: { titre: string; description: string; projetId: string | null; assigneId: string; nouvelExterne?: NouvelExterne | null; echeance: string | null; debut: string | null; estimationHeures: number | null },
): Promise<{ id: string } | { erreur: string }> {
  const titre = texte(d.titre, 200);
  if (!titre) return { erreur: "Donnez un titre à la tâche." };
  if (d.debut && d.echeance && d.debut > d.echeance) return { erreur: "Le début doit précéder l'échéance." };
  const projet = await projetPourAssignation(d.projetId);
  if (d.projetId && !projet) return { erreur: "Projet introuvable." };
  if (d.projetId && !(await projetAccessible(a, d.projetId))) return { erreur: "Projet introuvable." };
  if (projet && !projetOuvert(projet)) return { erreur: "Ce projet ne reçoit pas de tâches (demande, refusé, finalisé ou archivé)." };
  const eff = await assigneEffectif(a, d, projet);
  if ("erreur" in eff) return { erreur: eff.erreur! };
  d = { ...d, assigneId: eff.id };
  const assigne = await personneActuelle(d.assigneId);
  if (!assigne?.actif) return { erreur: "Cette personne n'est plus active." };
  if (!peutAssigner(acteur(a), d.assigneId, projet, assigne.externe)) return { erreur: "Vous ne pouvez pas confier une tâche à cette personne." };
  const [t] = await db
    .insert(schema.taches)
    .values({ titre, description: texte(d.description, 4000), projetId: d.projetId, assigneId: d.assigneId, echeance: d.echeance, debut: d.debut, estimationHeures: d.estimationHeures, creeParId: a.moi.id })
    .returning({ id: schema.taches.id });
  await db.insert(schema.evenementsTache).values({ tacheId: t.id, auteurId: a.moi.id, type: "creation" });
  await entrerDansLEquipe(d.projetId, d.assigneId, a.moi.id);
  if (d.assigneId !== a.moi.id && (!assigne.externe || assigne.acces)) await db.insert(schema.notifications).values({ personneId: d.assigneId, type: "tache", texte: `${a.moi.prenom} ${a.moi.nom} vous a confié « ${titre} »`, lien: `/taches/${t.id}` });
  await noter(a.moi.id, "tache_creee", t.id, { assigne: d.assigneId, projet: d.projetId });
  return { id: t.id };
}

/** Titre, description, projet, personne : la réassignation suit la règle d'assignation ; les deux personnes sont prévenues. */
export async function modifierDefinitionTache(
  a: Acces,
  tache: typeof schema.taches.$inferSelect,
  d: { titre: string; description: string; projetId: string | null; assigneId: string; nouvelExterne?: NouvelExterne | null },
): Promise<{ ok: true } | { erreur: string }> {
  const titre = texte(d.titre, 200);
  if (!titre) return { erreur: "Donnez un titre à la tâche." };
  const projet = await projetPourAssignation(d.projetId);
  if (d.projetId && !projet) return { erreur: "Projet introuvable." };
  const eff = await assigneEffectif(a, d, projet);
  if ("erreur" in eff) return { erreur: eff.erreur! };
  d = { ...d, assigneId: eff.id };
  const change = { titre: titre !== tache.titre, projet: d.projetId !== tache.projetId, assigne: d.assigneId !== tache.assigneId };
  if (change.projet && d.projetId && !(await projetAccessible(a, d.projetId))) return { erreur: "Projet introuvable." };
  if (change.projet && projet && !projetOuvert(projet)) return { erreur: "Ce projet ne reçoit pas de tâches (demande, refusé, finalisé ou archivé)." };
  const assigne = await personneActuelle(d.assigneId);
  if (change.assigne && !assigne?.actif) return { erreur: "Cette personne n'est plus active." };
  if ((change.assigne || change.projet) && !peutAssigner(acteur(a), d.assigneId, projet, !!assigne?.externe)) return { erreur: "Vous ne pouvez pas confier cette tâche à cette personne." };
  await db.update(schema.taches).set({ titre, description: texte(d.description, 4000), projetId: d.projetId, assigneId: d.assigneId, majLe: new Date() }).where(eq(schema.taches.id, tache.id));
  if (change.titre) await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "titre", avant: tache.titre, apres: titre });
  if (change.projet) await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "projet", avant: tache.projetId, apres: d.projetId });
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
  await db.update(schema.taches).set({ annuleeLe: new Date(), annuleeParId: a.moi.id, motifAnnulation: m, majLe: new Date() }).where(eq(schema.taches.id, tache.id));
  await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "annulation", note: m });
  if (tache.assigneId !== a.moi.id) await db.insert(schema.notifications).values({ personneId: tache.assigneId, type: "tache", texte: `« ${tache.titre} » est annulée : ${m}`, lien: `/taches/${tache.id}` });
  await noter(a.moi.id, "tache_annulee", tache.id, { motif: m });
  return { ok: true };
}

export async function retablirTache(a: Acces, tache: typeof schema.taches.$inferSelect) {
  await db.update(schema.taches).set({ annuleeLe: null, annuleeParId: null, motifAnnulation: "", majLe: new Date() }).where(eq(schema.taches.id, tache.id));
  await db.insert(schema.evenementsTache).values({ tacheId: tache.id, auteurId: a.moi.id, type: "retablie" });
  await noter(a.moi.id, "tache_retablie", tache.id);
}

/** Supprimer une tâche sans histoire (sinon : refus, il faut l'annuler). */
export async function supprimerTache(a: Acces, tache: typeof schema.taches.$inferSelect): Promise<{ ok: true } | { erreur: string }> {
  if (!tacheSupprimable({ statut: tache.statut, ...(await histoireDeTache(tache.id)) })) return { erreur: "Cette tâche a déjà une histoire : annulez-la plutôt." };
  await db.delete(schema.taches).where(eq(schema.taches.id, tache.id));
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
