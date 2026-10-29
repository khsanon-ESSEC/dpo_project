"use server";

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
import { peutDecider, peutGererProjet } from "@/lib/projets";
import { externeDuFormulaire } from "@/lib/donnees/externes";

const UUID = /^[0-9a-f-]{36}$/;

async function exigerGestion(projetId: string) {
  if (!UUID.test(projetId)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, projetId);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) throw new Error("Seuls le chef de projet, sa direction et les exécutifs gèrent ce projet.");
  return { u, a, p };
}

const revalider = (projetId?: string) => {
  revalidatePath("/projets", "layout");
  if (projetId) revalidatePath(`/projets/${projetId}`, "layout");
};

export async function proposer(form: FormData) {
  const u = await exigerInterne();
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
  );
  if ("erreur" in r) redirect(`/projets/nouveau?erreur=${encodeURIComponent(r.erreur)}`);
  revalider();
  redirect(`/projets/${r.id}?propose=1`);
}

export async function decider(projetId: string, form: FormData) {
  if (!UUID.test(projetId)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, projetId);
  if (!peutDecider(a)) throw new Error("Seuls un directeur ou un exécutif décident d'une demande de projet.");
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
  const { u } = await exigerGestion(projetId);
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
});

export async function nouveauLivrable(projetId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  const r = await ajouterLivrable(projetId, donneesLivrable(form), u.id);
  revalider(projetId);
  if ("erreur" in r) redirect(`/projets/${projetId}/modifier?erreur=${encodeURIComponent(r.erreur)}#livrables`);
  redirect(`/projets/${projetId}/modifier?livrable=ajoute#livrables`);
}

export async function enregistrerLivrable(projetId: string, livrableId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  const r = await modifierLivrable(projetId, livrableId, donneesLivrable(form), u.id);
  revalider(projetId);
  if ("erreur" in r) redirect(`/projets/${projetId}/modifier?erreur=${encodeURIComponent(r.erreur)}#livrable-${livrableId}`);
  redirect(`/projets/${projetId}/modifier?livrable=enregistre#livrable-${livrableId}`);
}

export async function nouvelIndicateur(projetId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  await ajouterIndicateur(projetId, String(form.get("libelle") ?? ""), u.id);
  revalider(projetId);
}

export async function renommer(projetId: string, indicateurId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  await renommerIndicateur(projetId, indicateurId, String(form.get("libelle") ?? ""), u.id);
  revalider(projetId);
}

export async function retirerInd(projetId: string, indicateurId: string) {
  const { u } = await exigerGestion(projetId);
  await retirerIndicateur(projetId, indicateurId, u.id);
  revalider(projetId);
}

export async function deplacerInd(projetId: string, indicateurId: string, sens: -1 | 1) {
  await exigerGestion(projetId);
  await deplacerIndicateur(projetId, indicateurId, sens);
  revalider(projetId);
}

// ---------- Équipe projet ----------

export async function ajouter(projetId: string, form: FormData) {
  const { u } = await exigerGestion(projetId);
  const personneId = (await externeDuFormulaire(form, "membre", u.id)) ?? String(form.get("personneId") ?? "");
  if (UUID.test(personneId)) await ajouterMembre(projetId, personneId, String(form.get("role") ?? ""), u.id);
  revalider(projetId);
}

export async function role(projetId: string, membreId: string, form: FormData) {
  await exigerGestion(projetId);
  await changerRoleMembre(projetId, membreId, String(form.get("role") ?? ""));
  revalider(projetId);
}

export async function retirer(projetId: string, membreId: string) {
  const { u } = await exigerGestion(projetId);
  await retirerMembre(projetId, membreId, u.id);
  revalider(projetId);
}
