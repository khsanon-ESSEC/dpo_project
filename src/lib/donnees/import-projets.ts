/**
 * Import en vrac des projets et des tâches (demandé le 29 octobre 2026). D'abord un aperçu (ce qui serait créé, et
 * les lignes à corriger), puis l'import, qui refait tous les contrôles : rien n'est écrit tant qu'une ligne est en
 * erreur. Réservé aux exécutifs (ils voient et gèrent tous les projets) : un administrateur n'obtient pas ainsi
 * d'accès aux projets ni aux tâches des autres. Lecture des fichiers : src/lib/import-projets.ts.
 */
import "server-only";
import { eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { codeSuggere, codeValide, peutAssigner, peutGererProjet, projetOuvert, verifierChefEtReferent } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import {
  lireCourriel,
  lireCourriels,
  lireDate,
  lireHeures,
  lireOuiNon,
  lirePrioriteImport,
  lireStatutProjet,
  lireStatutTache,
  type LigneBrute,
} from "@/lib/import-projets";
import { acteur, projetPourAssignation } from "./gestion";
import { libelleListe, valeurOuAjout } from "./listes";
import { recalculerSante } from "./sante";

export type ErreurLigne = { ligne: number; message: string };

export type ProjetPrevu = {
  ligne: number;
  code: string;
  titre: string;
  description: string;
  programme: string;
  division: string;
  chefId: string;
  chef: string;
  referentId: string | null;
  sponsorId: string | null;
  equipe: { id: string; nom: string }[];
  statut: "en_attente" | "en_cours" | "continu" | "finalise";
  priorite: "haute" | "normale" | "basse";
  strategique: boolean;
  dateEntree: string | null;
  dateFinInitiale: string | null;
  dateFinPrevue: string | null;
  dateLancementPrevue: string | null;
};

export type PlanProjets = { projets: ProjetPrevu[]; erreurs: ErreurLigne[]; nouveauxProgrammes: string[]; nouvellesDivisions: string[] };

export const peutImporterProjets = (a: Acces) => a.toutVoir && !a.moi.externe;

const texte = (v: string, n: number) => v.replace(/\s+/g, " ").trim().slice(0, n);

async function personnesParCourriel() {
  const org = await chargerOrganisation();
  const m = new Map<string, { id: string; nom: string; externe: boolean; actif: boolean }>();
  for (const p of org.personnes.values()) if (p.courriel) m.set(p.courriel.toLowerCase(), { id: p.id, nom: nomComplet(p), externe: p.externe, actif: p.actif });
  return m;
}

export async function planImportProjets(lignes: LigneBrute[]): Promise<PlanProjets> {
  const gens = await personnesParCourriel();
  const pris = new Set((await db.select({ code: schema.projets.code }).from(schema.projets)).map((x) => x.code));
  const listes = await db.select().from(schema.listesProjet);
  const connu = (genre: string, v: string) => listes.some((l) => l.genre === genre && l.actif && l.libelle.toLocaleLowerCase("fr") === v.toLocaleLowerCase("fr"));
  const erreurs: ErreurLigne[] = [];
  const projets: ProjetPrevu[] = [];
  const nouveauxProgrammes = new Set<string>();
  const nouvellesDivisions = new Set<string>();
  for (const { ligne, valeurs: v } of lignes) {
    const fautes: string[] = [];
    const titre = texte(v.titre, 160);
    if (!titre) fautes.push("titre manquant");
    let code = v.code ? codeValide(v.code) : codeSuggere(titre || "Projet", [...pris]);
    if (v.code && !code) fautes.push(`code « ${v.code.slice(0, 10)} » : 2 à 4 lettres ou chiffres`);
    if (code && pris.has(code)) {
      if (v.code) fautes.push(`le code ${code} est déjà pris`);
      else code = codeSuggere(`${titre} ${ligne}`, [...pris]);
    }
    const personne = (cle: string, libelle: string, obligatoire = false) => {
      const c = lireCourriel(v[cle] ?? "");
      if ("erreur" in c) return fautes.push(`${libelle} : ${c.erreur}`), null;
      if (!c.courriel) return obligatoire ? (fautes.push(`${libelle} manquant`), null) : null;
      const p = gens.get(c.courriel);
      if (!p || !p.actif) return fautes.push(`${libelle} : personne inconnue ou inactive (${c.courriel})`), null;
      return p;
    };
    const chef = personne("chef", "chef de projet", true);
    const referent = personne("referent", "référent DPO");
    const sponsor = personne("sponsor", "sponsor métier");
    const incoherence = chef ? verifierChefEtReferent(chef, referent) : null;
    if (incoherence) fautes.push(incoherence.replace(/\.$/, ""));
    const eq = lireCourriels(v.equipe ?? "");
    const equipe: { id: string; nom: string }[] = [];
    if ("erreur" in eq) fautes.push(`équipe : ${eq.erreur}`);
    else
      for (const c of eq.courriels) {
        const p = gens.get(c);
        if (!p || !p.actif) fautes.push(`équipe : personne inconnue ou inactive (${c})`);
        else if (p.id !== chef?.id) equipe.push({ id: p.id, nom: p.nom });
      }
    const statut = lireStatutProjet(v.statut ?? "");
    if (!statut) fautes.push(`statut « ${v.statut} » : En attente, En cours, Continu ou Finalisé`);
    const priorite = lirePrioriteImport(v.priorite ?? "");
    if (!priorite) fautes.push(`priorité « ${v.priorite} » : Haute, Normale ou Basse`);
    const strategique = lireOuiNon(v.strategique ?? "");
    if (strategique === null) fautes.push(`stratégique « ${v.strategique} » : oui ou non`);
    const dates: Record<string, string | null> = {};
    for (const [cle, libelle] of [
      ["dateEntree", "date d'entrée"],
      ["dateFinInitiale", "fin prévue initialement"],
      ["dateFinPrevue", "fin prévue"],
      ["dateLancementPrevue", "lancement prévu"],
    ] as const) {
      const d = lireDate(v[cle] ?? "");
      if ("erreur" in d) fautes.push(`${libelle} : ${d.erreur}`);
      else dates[cle] = d.date;
    }
    if (dates.dateEntree && dates.dateFinPrevue && dates.dateFinPrevue < dates.dateEntree) fautes.push("la fin prévue précède la date d'entrée");
    const programme = libelleListe("programme", v.programme ?? "");
    const division = libelleListe("division", v.division ?? "");
    if (fautes.length) {
      erreurs.push({ ligne, message: fautes.join(" ; ") });
      continue;
    }
    pris.add(code!);
    if (programme && !connu("programme", programme)) nouveauxProgrammes.add(programme);
    if (division && !connu("division", division)) nouvellesDivisions.add(division);
    projets.push({
      ligne,
      code: code!,
      titre,
      description: texte(v.description ?? "", 2000),
      programme,
      division,
      chefId: chef!.id,
      chef: chef!.nom,
      referentId: referent?.id ?? null,
      sponsorId: sponsor?.id ?? null,
      equipe,
      statut: statut!,
      priorite: priorite!,
      strategique: !!strategique,
      dateEntree: dates.dateEntree ?? null,
      dateFinInitiale: dates.dateFinInitiale ?? dates.dateFinPrevue ?? null,
      dateFinPrevue: dates.dateFinPrevue ?? null,
      dateLancementPrevue: dates.dateLancementPrevue ?? null,
    });
  }
  // Deux lignes du fichier avec le même code.
  const vus = new Map<string, number>();
  for (const p of projets) {
    if (vus.has(p.code)) erreurs.push({ ligne: p.ligne, message: `le code ${p.code} est aussi celui de la ligne ${vus.get(p.code)}` });
    else vus.set(p.code, p.ligne);
  }
  return { projets, erreurs: erreurs.sort((x, y) => x.ligne - y.ligne), nouveauxProgrammes: [...nouveauxProgrammes], nouvellesDivisions: [...nouvellesDivisions] };
}

export async function appliquerImportProjets(a: Acces, lignes: LigneBrute[]): Promise<{ ok: true; n: number } | { erreur: string; plan?: PlanProjets }> {
  if (!peutImporterProjets(a)) return { erreur: "L'import des projets est réservé aux exécutifs." };
  const plan = await planImportProjets(lignes);
  if (plan.erreurs.length) return { erreur: "Des lignes sont à corriger : rien n'a été importé.", plan };
  if (!plan.projets.length) return { erreur: "Rien à importer." };
  const maintenant = new Date();
  const ids: string[] = [];
  for (const p of plan.projets) {
    const programme = p.programme ? await valeurOuAjout("programme", p.programme, a.moi.id) : "";
    const division = p.division ? await valeurOuAjout("division", p.division, a.moi.id) : "";
    const [n] = await db
      .insert(schema.projets)
      .values({
        code: p.code,
        titre: p.titre,
        description: p.description,
        programme,
        division,
        strategique: p.strategique,
        statut: p.statut,
        priorite: p.priorite,
        chefProjetId: p.chefId,
        referentId: p.referentId,
        sponsorId: p.sponsorId,
        dateEntree: p.dateEntree,
        dateFinInitiale: p.dateFinInitiale,
        dateFinPrevue: p.dateFinPrevue,
        dateLancementPrevue: p.dateLancementPrevue,
        decisionParId: a.moi.id,
        decisionLe: maintenant,
        motifDecision: "Importé",
        clotureLe: p.statut === "finalise" ? (p.dateFinPrevue ?? aujourdhui()) : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.projets.id });
    if (!n) continue; // le code a été pris entre l'aperçu et l'import
    ids.push(n.id);
    if (p.equipe.length) await db.insert(schema.membresProjet).values(p.equipe.map((m) => ({ projetId: n.id, personneId: m.id, ajouteParId: a.moi.id }))).onConflictDoNothing();
    const prevenir = [p.chefId, p.referentId].filter((x): x is string => !!x && x !== a.moi.id);
    if (prevenir.length) await db.insert(schema.notifications).values(prevenir.map((id) => ({ personneId: id, type: "projet", texte: `${id === p.chefId ? "Vous êtes chef" : "Vous êtes le référent DPO"} du projet « ${p.titre} »`, lien: `/projets/${n.id}` })));
  }
  if (ids.length) await recalculerSante(ids);
  await noter(a.moi.id, "import_projets", null, { projets: ids.length, lignes: lignes.length });
  return { ok: true, n: ids.length };
}

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------

export type TachePrevue = {
  ligne: number;
  titre: string;
  description: string;
  projetId: string | null;
  projetCode: string | null;
  assigneId: string;
  assigne: string;
  livrable: string | null;
  livrableId: string | null;
  statut: "a_faire" | "en_cours" | "bloquee" | "faite";
  priorite: "haute" | "normale" | "basse";
  debut: string | null;
  echeance: string | null;
  estimationHeures: number | null;
};

export type PlanTaches = { taches: TachePrevue[]; erreurs: ErreurLigne[]; nouveauxLivrables: { projetCode: string; libelle: string }[] };

export async function planImportTaches(a: Acces, lignes: LigneBrute[]): Promise<PlanTaches> {
  const gens = await personnesParCourriel();
  const projets = await db.select().from(schema.projets);
  const parCode = new Map(projets.map((p) => [p.code.toUpperCase(), p]));
  const livrables = await db.select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, libelle: schema.indicateurs.libelle }).from(schema.indicateurs);
  const cleLiv = (projetId: string, l: string) => `${projetId}|${l.toLocaleLowerCase("fr")}`;
  const parLivrable = new Map(livrables.map((l) => [cleLiv(l.projetId, l.libelle), l.id]));
  const pourAssigner = new Map<string, Awaited<ReturnType<typeof projetPourAssignation>>>();
  const erreurs: ErreurLigne[] = [];
  const taches: TachePrevue[] = [];
  const nouveaux = new Map<string, { projetCode: string; libelle: string }>();
  for (const { ligne, valeurs: v } of lignes) {
    const fautes: string[] = [];
    const titre = texte(v.titre, 200);
    if (!titre) fautes.push("titre manquant");
    let projet: (typeof projets)[number] | null = null;
    if (v.projet) {
      projet = parCode.get(v.projet.trim().toUpperCase()) ?? null;
      if (!projet) fautes.push(`projet « ${v.projet.slice(0, 10)} » inconnu`);
      else if (!projetOuvert(projet)) fautes.push(`le projet ${projet.code} ne reçoit plus de tâches (demande, refusé, finalisé ou archivé)`);
      else if (!peutGererProjet(acteur(a), projet)) fautes.push(`vous ne gérez pas le projet ${projet.code}`);
    }
    const c = lireCourriel(v.pour ?? "");
    let assigne: { id: string; nom: string; externe: boolean } | null = null;
    if ("erreur" in c) fautes.push(`pour : ${c.erreur}`);
    else if (!c.courriel) fautes.push("« Pour » manquant");
    else {
      const p = gens.get(c.courriel);
      if (!p || !p.actif) fautes.push(`pour : personne inconnue ou inactive (${c.courriel})`);
      else assigne = p;
    }
    if (assigne && (!v.projet || projet)) {
      let pa = projet ? pourAssigner.get(projet.id) : null;
      if (projet && pa === undefined) {
        pa = await projetPourAssignation(projet.id);
        pourAssigner.set(projet.id, pa);
      }
      if (!peutAssigner(acteur(a), assigne.id, pa ?? null, assigne.externe)) fautes.push(`vous ne pouvez pas confier une tâche à ${assigne.nom}${projet ? ` sur ${projet.code}` : ""}`);
    }
    const statut = lireStatutTache(v.statut ?? "");
    if (!statut) fautes.push(`statut « ${v.statut} » : À faire, En cours, Bloquée ou Faite`);
    const priorite = lirePrioriteImport(v.priorite ?? "");
    if (!priorite) fautes.push(`priorité « ${v.priorite} » : Haute, Normale ou Basse`);
    const debut = lireDate(v.debut ?? "");
    if ("erreur" in debut) fautes.push(`début : ${debut.erreur}`);
    const echeance = lireDate(v.echeance ?? "");
    if ("erreur" in echeance) fautes.push(`échéance : ${echeance.erreur}`);
    if (!("erreur" in debut) && !("erreur" in echeance) && debut.date && echeance.date && debut.date > echeance.date) fautes.push("le début suit l'échéance");
    const h = lireHeures(v.estimation ?? "");
    if ("erreur" in h) fautes.push(h.erreur);
    const libelle = texte(v.livrable ?? "", 200);
    if (libelle && !v.projet) fautes.push("un livrable demande un projet");
    if (fautes.length) {
      erreurs.push({ ligne, message: fautes.join(" ; ") });
      continue;
    }
    const livrableId = libelle && projet ? (parLivrable.get(cleLiv(projet.id, libelle)) ?? null) : null;
    if (libelle && projet && !livrableId) nouveaux.set(cleLiv(projet.id, libelle), { projetCode: projet.code, libelle });
    taches.push({
      ligne,
      titre,
      description: texte(v.description ?? "", 4000),
      projetId: projet?.id ?? null,
      projetCode: projet?.code ?? null,
      assigneId: assigne!.id,
      assigne: assigne!.nom,
      livrable: libelle || null,
      livrableId,
      statut: statut!,
      priorite: priorite!,
      debut: "erreur" in debut ? null : debut.date,
      echeance: "erreur" in echeance ? null : echeance.date,
      estimationHeures: "erreur" in h ? null : h.heures,
    });
  }
  return { taches, erreurs, nouveauxLivrables: [...nouveaux.values()] };
}

export async function appliquerImportTaches(a: Acces, lignes: LigneBrute[]): Promise<{ ok: true; n: number; livrables: number } | { erreur: string; plan?: PlanTaches }> {
  if (!peutImporterProjets(a)) return { erreur: "L'import des tâches est réservé aux exécutifs." };
  const plan = await planImportTaches(a, lignes);
  if (plan.erreurs.length) return { erreur: "Des lignes sont à corriger : rien n'a été importé.", plan };
  if (!plan.taches.length) return { erreur: "Rien à importer." };
  // Les livrables qui manquent, créés une fois chacun (à la fin de la liste du projet).
  const crees = new Map<string, string>();
  for (const t of plan.taches) {
    if (!t.projetId || !t.livrable || t.livrableId) continue;
    const cle = `${t.projetId}|${t.livrable.toLocaleLowerCase("fr")}`;
    if (crees.has(cle)) continue;
    const [{ m }] = await db.select({ m: max(schema.indicateurs.ordre) }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, t.projetId));
    const [n] = await db.insert(schema.indicateurs).values({ projetId: t.projetId, libelle: t.livrable, ordre: (m ?? 0) + 1 }).returning({ id: schema.indicateurs.id });
    crees.set(cle, n.id);
  }
  const maintenant = new Date();
  const lignesTaches = plan.taches.map((t) => ({
    titre: t.titre,
    description: t.description,
    projetId: t.projetId,
    assigneId: t.assigneId,
    creeParId: a.moi.id,
    livrableId: t.livrableId ?? (t.projetId && t.livrable ? (crees.get(`${t.projetId}|${t.livrable.toLocaleLowerCase("fr")}`) ?? null) : null),
    statut: t.statut,
    priorite: t.priorite,
    debut: t.debut,
    echeance: t.echeance,
    estimationHeures: t.estimationHeures,
    termineeLe: t.statut === "faite" ? (t.echeance ? new Date(`${t.echeance}T12:00:00Z`) : maintenant) : null,
  }));
  const ids: string[] = [];
  for (let i = 0; i < lignesTaches.length; i += 200) {
    const n = await db.insert(schema.taches).values(lignesTaches.slice(i, i + 200)).returning({ id: schema.taches.id });
    ids.push(...n.map((x) => x.id));
  }
  await db.insert(schema.evenementsTache).values(ids.map((id) => ({ tacheId: id, auteurId: a.moi.id, type: "creation", note: "Importée" })));
  // La personne d'une tâche de projet entre dans l'équipe du projet (comme quand on lui confie une tâche).
  const paires = new Map<string, { projetId: string; personneId: string }>();
  for (const t of plan.taches) if (t.projetId) paires.set(`${t.projetId}|${t.assigneId}`, { projetId: t.projetId, personneId: t.assigneId });
  const projets = [...new Set(plan.taches.map((t) => t.projetId).filter((x): x is string => !!x))];
  const chefs = projets.length ? await db.select({ id: schema.projets.id, chef: schema.projets.chefProjetId }).from(schema.projets).where(inArray(schema.projets.id, projets)) : [];
  const chefDe = new Map(chefs.map((c) => [c.id, c.chef]));
  const entrees = [...paires.values()].filter((x) => chefDe.get(x.projetId) !== x.personneId);
  if (entrees.length) await db.insert(schema.membresProjet).values(entrees.map((x) => ({ ...x, ajouteParId: a.moi.id }))).onConflictDoNothing();
  if (projets.length) await recalculerSante(projets);
  await noter(a.moi.id, "import_taches", null, { taches: ids.length, livrables: crees.size, lignes: lignes.length });
  return { ok: true, n: ids.length, livrables: crees.size };
}

