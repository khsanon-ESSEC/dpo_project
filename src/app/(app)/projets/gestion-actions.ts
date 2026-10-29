"use server";

import { objectifsDeLaDemande } from "@/lib/donnees/objectifs";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerInterne, exigerUtilisateur } from "@/lib/auth/session";
import {
  ajouterIndicateur,
  ajouterLivrable,
  modifierLivrable,
  ajouterMembre,
  archiverProjet,
  changerRoleMembre,
  deciderDemande,
  deplacerIndicateur,
  modifierProjet,
  proposerProjet,
  renommerIndicateur,
  retirerIndicateur,
  retirerMembre,
  supprimerProjet,
} from "@/lib/donnees/gestion";
import { peutDeciderDemande, peutGererProjet } from "@/lib/projets";
import { externeDuFormulaire } from "@/lib/donnees/externes";
import { retourLivrable } from "./[id]/livrables/commun";

const UUID = /^[0-9a-f-]{36}$/;

async function exigerGestion(projetId: string) {
  if (!UUID.test(projetId)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, projetId);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) throw new Error("Seuls le chef de projet, sa direction et les exécutifs gèrent ce projet.");
  return { u, a, p };
}

/** Modifier un projet (fiche, livrables, équipe) : pas archivé ni refusé (revue du 29 octobre 2026). */
async function exigerGestionModifiable(projetId: string) {
  const r = await exigerGestion(projetId);
  if (r.p.archiveLe || r.p.statut === "refuse") throw new Error("Ce projet est archivé ou refusé : désarchivez-le pour le modifier.");
  return r;
}

const revalider = (projetId?: string) => {
  revalidatePath("/projets", "layout");
  if (projetId) revalidatePath(`/projets/${projetId}`, "layout");
};

export async function proposer(form: FormData) {
  const u = await exigerInterne();
  // Un exécutif crée le projet directement : pas de demande à valider (29 octobre 2026).
  const executif = (await acces(u)).toutVoir;
  const r = await proposerProjet(
    {
      titre: String(form.get("titre") ?? ""),
      description: String(form.get("description") ?? ""),
      justification: String(form.get("justification") ?? ""),
      programme: String(form.get("programme") ?? ""),
      strategique: form.get("strategique") === "on",
      finSouhaitee: String(form.get("finSouhaitee") ?? ""),
      chefSuggereId: (await externeDuFormulaire(form, "chef", u.id)) ?? String(form.get("chefSuggereId") ?? ""),
      code: String(form.get("code") ?? ""),
      division: String(form.get("division") ?? ""),
    },
    u.id,
    executif ? { statut: String(form.get("statut") ?? ""), referentId: String(form.get("referentId") ?? ""), dateEntree: String(form.get("dateEntree") ?? "") } : undefined,
  );
  if ("erreur" in r) redirect(`/projets/nouveau?erreur=${encodeURIComponent(r.erreur)}`);
  await objectifsDeLaDemande(r.id, form.get("objectifs"));
  revalider();
  redirect(`/projets/${r.id}?${executif ? "cree" : "propose"}=1`);
}

export async function decider(projetId: string, form: FormData) {
  if (!UUID.test(projetId)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const projet = await exigerProjetVisible(a, projetId);
  if (!peutDeciderDemande(a, projet)) throw new Error("Seuls un exécutif, ou un directeur de la direction du demandeur, décident de cette demande.");
  const accepte = form.get("decision") === "accepter";
  const r = await deciderDemande(
    projetId,
    {
      accepte,
      motif: String(form.get("motif") ?? ""),
      statut: String(form.get("statut") ?? ""),
      chefProjetId: accepte ? ((await externeDuFormulaire(form, "chef", u.id)) ?? String(form.get("chefProjetId") ?? "")) : "",
      referentId: String(form.get("referentId") ?? ""),
      division: form.has("division") ? String(form.get("division") ?? "") : undefined,
      dateEntree: String(form.get("dateEntree") ?? ""),
      dateFinPrevue: String(form.get("dateFinPrevue") ?? ""),
      strategique: form.get("strategique") === "on",
    },
    u.id,
  );
  revalider(projetId);
  if ("erreur" in r) redirect(`/projets/${projetId}?erreur=${encodeURIComponent(r.erreur)}#decision`);
  redirect(`/projets/${projetId}`);
}

export async function enregistrerProjet(projetId: string, form: FormData) {
  const { u, p } = await exigerGestion(projetId);
  if (p.archiveLe || p.statut === "refuse") redirect(`/projets/${projetId}/modifier?erreur=${encodeURIComponent("Ce projet est archivé ou refusé : désarchivez-le pour le modifier.")}`);
  const champ = (k: string) => String(form.get(k) ?? "");
  const r = await modifierProjet(
    projetId,
    {
      code: champ("code"),
      titre: champ("titre"),
      description: champ("description"),
      programme: champ("programme"),
      strategique: form.get("strategique") === "on",
      statut: champ("statut"),
      chefProjetId: (await externeDuFormulaire(form, "chef", u.id)) ?? champ("chefProjetId"),
      referentId: champ("referentId"),
      division: champ("division"),
      dateEntree: champ("dateEntree"),
      dateFinInitiale: champ("dateFinInitiale"),
      dateFinPrevue: champ("dateFinPrevue"),
      dateLancementPrevue: champ("dateLancementPrevue"),
      motifReport: champ("motifReport"),
      sponsorId: form.has("sponsorId") ? ((await externeDuFormulaire(form, "sponsor", u.id)) ?? champ("sponsorId")) : undefined,
      priorite: form.has("priorite") ? champ("priorite") : undefined,
    },
    u.id,
  );
  revalider(projetId);
  redirect(`/projets/${projetId}/modifier${"erreur" in r ? `?erreur=${encodeURIComponent(r.erreur)}` : "?enregistre=1"}`);
}

export async function archiver(projetId: string, archive: boolean) {
  const { u } = await exigerGestion(projetId);
  await archiverProjet(projetId, archive, u.id);
  revalider(projetId);
  redirect(`/projets/${projetId}`);
}

export async function supprimer(projetId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  if (form.get("confirme") !== "on") redirect(`/projets/${projetId}/modifier?erreur=${encodeURIComponent("Cochez « Oui, supprimer définitivement » pour confirmer.")}#zone`);
  const r = await supprimerProjet(projetId, u.id);
  revalider();
  if ("erreur" in r) redirect(`/projets/${projetId}/modifier?erreur=${encodeURIComponent(r.erreur)}#zone`);
  redirect("/projets?supprime=1");
}

// ---------- Livrables ----------

const donneesLivrable = (form: FormData) => ({
  libelle: String(form.get("libelle") ?? ""),
  prevuLe: String(form.get("prevuLe") ?? "") || null,
  responsableId: UUID.test(String(form.get("responsableId") ?? "")) ? String(form.get("responsableId")) : null,
  critere: String(form.get("critere") ?? ""),
  phaseId: form.has("phaseId") ? (UUID.test(String(form.get("phaseId") ?? "")) ? String(form.get("phaseId")) : null) : undefined,
});

/**
 * « Nouveau livrable » (sa propre page, 29 octobre 2026) : on revient à la fiche du projet, ou à la liste des
 * livrables ; « Ajouter et en saisir un autre » rouvre la page vide.
 */
export async function nouveauLivrable(projetId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  const retour = retourLivrable(form.get("retour"));
  const r = await ajouterLivrable(projetId, donneesLivrable(form), u.id);
  revalider(projetId);
  if ("erreur" in r) redirect(`/projets/${projetId}/livrables/nouveau?retour=${retour}&erreur=${encodeURIComponent(r.erreur)}`);
  if (form.get("encore") === "1") redirect(`/projets/${projetId}/livrables/nouveau?retour=${retour}&ajoute=1`);
  redirect(retour === "liste" ? `/projets/${projetId}/livrables?livrable=ajoute#livrable-${r.id}` : `/projets/${projetId}?livrable=ajoute#livrable-${r.id}`);
}

export async function enregistrerLivrable(projetId: string, livrableId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  const r = await modifierLivrable(projetId, livrableId, donneesLivrable(form), u.id);
  revalider(projetId);
  if ("erreur" in r) redirect(`/projets/${projetId}/livrables?ouvrir=${livrableId}&erreur=${encodeURIComponent(r.erreur)}#livrable-${livrableId}`);
  redirect(`/projets/${projetId}/livrables?livrable=enregistre#livrable-${livrableId}`);
}

export async function nouvelIndicateur(projetId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  await ajouterIndicateur(projetId, String(form.get("libelle") ?? ""), u.id);
  revalider(projetId);
}

export async function renommer(projetId: string, indicateurId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  await renommerIndicateur(projetId, indicateurId, String(form.get("libelle") ?? ""), u.id);
  revalider(projetId);
}

export async function retirerInd(projetId: string, indicateurId: string) {
  const { u } = await exigerGestionModifiable(projetId);
  await retirerIndicateur(projetId, indicateurId, u.id);
  revalider(projetId);
}

export async function deplacerInd(projetId: string, indicateurId: string, sens: -1 | 1) {
  await exigerGestionModifiable(projetId);
  await deplacerIndicateur(projetId, indicateurId, sens);
  revalider(projetId);
}

// ---------- Équipe projet ----------

export async function ajouter(projetId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  const personneId = (await externeDuFormulaire(form, "membre", u.id)) ?? String(form.get("personneId") ?? "");
  if (UUID.test(personneId)) await ajouterMembre(projetId, personneId, String(form.get("role") ?? ""), u.id);
  revalider(projetId);
}

export async function role(projetId: string, membreId: string, form: FormData) {
  const { u } = await exigerGestionModifiable(projetId);
  await changerRoleMembre(projetId, membreId, String(form.get("role") ?? ""), u.id);
  revalider(projetId);
}

export async function retirer(projetId: string, membreId: string) {
  const { u } = await exigerGestionModifiable(projetId);
  await retirerMembre(projetId, membreId, u.id);
  revalider(projetId);
}
