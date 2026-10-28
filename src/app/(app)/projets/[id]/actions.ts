"use server";

import { peutGererProjet } from "@/lib/projets";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { mettreAJourIndicateur } from "@/lib/donnees/projets";
import { noter } from "@/lib/journal";

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
  revalidatePath(`/projets/${projetId}`);
}

export async function mettreAJourProjet(projetId: string, form: FormData) {
  const { u, p } = await exigerDroitProjet(projetId);
  const sante = String(form.get("sante") ?? "");
  const valeurs = {
    sante: (["dans_les_temps", "a_surveiller", "en_retard"].includes(sante) ? sante : p.sante) as typeof p.sante,
    dateFinPrevue: date(form.get("dateFinPrevue")) ?? p.dateFinPrevue,
    dateLancementPrevue: date(form.get("dateLancementPrevue")),
    majLe: new Date(),
  };
  await db.update(schema.projets).set(valeurs).where(eq(schema.projets.id, projetId));
  await noter(u.id, "projet_modifie", projetId, { ...valeurs, majLe: undefined });
  revalidatePath(`/projets/${projetId}`);
}
