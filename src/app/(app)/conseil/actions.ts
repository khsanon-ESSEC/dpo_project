"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerAccesConseil, idsProjetsVisibles, type Acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateLongue } from "@/lib/dates";
import {
  ajouterProjetAuRapport,
  approuverRapportConseil,
  creerRapportPonctuel,
  faitsDepuis,
  modifierEtat,
  modifierObjet,
  rapportConseil,
  retirerLigneDuRapport,
} from "@/lib/donnees/conseil";
import { demanderIA } from "@/lib/ia";
import { noter } from "@/lib/journal";
import { peutModifierRapportConseil } from "@/lib/regles";
import { peutGererProjet } from "@/lib/projets";

async function exigerConseil() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  return { u, a };
}

const revalider = () => revalidatePath("/conseil", "layout");

/** Ligne d'un rapport encore en brouillon, sur un projet que la personne peut voir (directeur : sa direction). */
async function ligneModifiable(ligneId: string, a: Acces) {
  const [l] = await db
    .select({ ligne: schema.lignesConseil, rapport: schema.rapportsConseil })
    .from(schema.lignesConseil)
    .innerJoin(schema.rapportsConseil, eq(schema.rapportsConseil.id, schema.lignesConseil.rapportId))
    .where(eq(schema.lignesConseil.id, ligneId));
  if (!l || l.rapport.statut !== "brouillon") throw new Error("Ce rapport n'est plus modifiable.");
  // Un rapport ponctuel appartient à son auteur : les autres directeurs ne le modifient pas.
  if (!peutModifierRapportConseil({ moiId: a.moi.id, toutVoir: a.toutVoir }, l.rapport)) throw new Error("Seul son auteur ou un exécutif modifie ce rapport.");
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(l.ligne.projetId)) throw new Error("Ce projet n'est pas dans votre direction.");
  // Rapport mensuel (commun à tous) : la ligne d'un projet se rédige par qui gère ce projet. Voir un projet
  // d'une autre direction, parce que les siens y travaillent, ne suffit pas.
  if (l.rapport.genre !== "ponctuel") {
    const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, l.ligne.projetId));
    if (!p || !peutGererProjet({ moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) throw new Error("Seul qui gère ce projet rédige sa ligne du rapport mensuel.");
  }
  return l;
}

export async function enregistrerEtat(ligneId: string, form: FormData) {
  const { u, a } = await exigerConseil();
  await ligneModifiable(ligneId, a);
  await modifierEtat(ligneId, String(form.get("etat") ?? "").slice(0, 2000));
  await noter(u.id, "conseil_etat_modifie", ligneId);
  revalider();
}

/**
 * Proposition de l'assistant, à partir de la fiche projet (et, pour un rapport ponctuel, de son objet et
 * de ce qui s'est passé depuis le début de la période). Elle remplace le texte et reste à relire.
 */
export async function redigerAvecAssistant(ligneId: string) {
  const { u, a } = await exigerConseil();
  const { ligne, rapport } = await ligneModifiable(ligneId, a);
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, ligne.projetId));
  const ind = await db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, p.id)).orderBy(asc(schema.indicateurs.ordre));
  const donnees = [
    `Projet : ${p.titre}. ${p.description}`,
    `Indicateurs vérifiables : ${ind.map((i) => `${i.libelle} (${i.etat === "atteint" ? "atteint" : i.etat === "en_cours" ? "en cours" : "à venir"})`).join(" ; ")}`,
    `Fin prévue au dernier rapport : ${dateLongue(ligne.dateFinDernierRapport)} ; fin prévue aujourd'hui : ${dateLongue(ligne.nouvelleDateFin)}.`,
  ];
  if (rapport.genre === "ponctuel" && rapport.depuis) {
    const f = await faitsDepuis(p.id, rapport.depuis);
    donnees.push(`Objet du rapport : ${rapport.titre}. ${rapport.objet}`);
    donnees.push(`Tâches terminées depuis le ${dateLongue(rapport.depuis)} : ${f.terminees.join(" ; ") || "aucune"}.`);
    donnees.push(`Tâches bloquées : ${f.bloquees.map((b) => `${b.titre}${b.blocage ? ` (${b.blocage})` : ""}`).join(" ; ") || "aucune"}.`);
  }
  donnees.push(`Texte actuel : ${ligne.etatAvancement}`);
  const consigne =
    rapport.genre === "ponctuel"
      ? "Tu rédiges l'« état d'avancement » d'un projet pour un rapport ponctuel au conseil d'administration d'une banque, demandé pour l'objet indiqué. Deux ou trois phrases, en français, ton factuel, sans titre : ce qui compte pour cet objet d'abord. N'utilise que les données fournies ; n'invente ni date ni chiffre."
      : "Tu rédiges l'« état d'avancement » d'un projet pour le rapport mensuel au conseil d'administration d'une banque. Deux ou trois phrases, en français, ton factuel, sans titre. N'utilise que les données fournies ; n'invente ni date ni chiffre.";
  const texte = await demanderIA(consigne, [{ role: "user", contenu: `<donnees>\n${donnees.join("\n")}\n</donnees>` }], 300);
  if (texte) await db.update(schema.lignesConseil).set({ etatAvancement: texte.slice(0, 2000), redigeParIa: true }).where(eq(schema.lignesConseil.id, ligneId));
  await noter(u.id, "conseil_etat_ia", ligneId);
  revalider();
}

/** Seul un exécutif approuve un rapport au conseil (mensuel ou ponctuel). */
export async function approuver(rapportId: string) {
  const { u, a } = await exigerConseil();
  if (!a.toutVoir) throw new Error("Seul un exécutif approuve un rapport au conseil.");
  await approuverRapportConseil(rapportId, u.id);
  revalider();
}

// ---------- Rapports ponctuels ----------

export async function creerPonctuel(form: FormData) {
  const { u, a } = await exigerConseil();
  const visibles = await idsProjetsVisibles(a);
  const r = await creerRapportPonctuel(
    {
      titre: String(form.get("titre") ?? ""),
      objet: String(form.get("objet") ?? ""),
      depuis: String(form.get("depuis") ?? ""),
      projetIds: form.getAll("projets").map(String),
    },
    u.id,
    visibles,
  );
  if ("erreur" in r) redirect(`/conseil/ponctuels/nouveau?erreur=${encodeURIComponent(r.erreur)}`);
  revalider();
  redirect(`/conseil/ponctuels/${r.id}`);
}

/** Un rapport ponctuel en brouillon que la personne peut modifier : le sien, ou n'importe lequel pour un exécutif. */
async function ponctuelModifiable(rapportId: string) {
  const { u, a } = await exigerConseil();
  const r = await rapportConseil(rapportId);
  if (!r || r.genre !== "ponctuel" || r.statut !== "brouillon") throw new Error("Ce rapport n'est plus modifiable.");
  if (!peutModifierRapportConseil({ moiId: u.id, toutVoir: a.toutVoir }, r)) throw new Error("Seul son auteur ou un exécutif modifie ce rapport.");
  return { u, a, r };
}

export async function modifierPonctuel(rapportId: string, form: FormData) {
  const { u } = await ponctuelModifiable(rapportId);
  await modifierObjet(rapportId, { titre: String(form.get("titre") ?? ""), objet: String(form.get("objet") ?? "") }, u.id);
  revalider();
}

export async function ajouterProjet(rapportId: string, form: FormData) {
  const { u, a } = await ponctuelModifiable(rapportId);
  const projetId = String(form.get("projetId") ?? "");
  const visibles = await idsProjetsVisibles(a);
  if (!/^[0-9a-f-]{36}$/.test(projetId) || (visibles !== "tous" && !visibles.has(projetId))) return;
  await ajouterProjetAuRapport(rapportId, projetId, u.id);
  revalider();
}

export async function retirerLigne(rapportId: string, ligneId: string) {
  const { u, a } = await ponctuelModifiable(rapportId);
  const { ligne } = await ligneModifiable(ligneId, a);
  if (ligne.rapportId !== rapportId) throw new Error("Cette ligne n'appartient pas à ce rapport.");
  await retirerLigneDuRapport(ligneId, u.id);
  revalider();
}
