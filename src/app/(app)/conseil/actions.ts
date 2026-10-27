"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerAccesConseil, idsProjetsVisibles, type Acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateLongue } from "@/lib/dates";
import { approuverRapportConseil, modifierEtat } from "@/lib/donnees/conseil";
import { demanderIA } from "@/lib/ia";
import { noter } from "@/lib/journal";

async function exigerConseil() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  return { u, a };
}

/** Ligne d'un rapport encore en brouillon, sur un projet que la personne peut voir (directeur : sa direction). */
async function ligneModifiable(ligneId: string, a: Acces) {
  const [l] = await db
    .select({ ligne: schema.lignesConseil, statut: schema.rapportsConseil.statut })
    .from(schema.lignesConseil)
    .innerJoin(schema.rapportsConseil, eq(schema.rapportsConseil.id, schema.lignesConseil.rapportId))
    .where(eq(schema.lignesConseil.id, ligneId));
  if (!l || l.statut !== "brouillon") throw new Error("Ce rapport n'est plus modifiable.");
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(l.ligne.projetId)) throw new Error("Ce projet n'est pas dans votre direction.");
  return l.ligne;
}

export async function enregistrerEtat(ligneId: string, form: FormData) {
  const { u, a } = await exigerConseil();
  await ligneModifiable(ligneId, a);
  await modifierEtat(ligneId, String(form.get("etat") ?? "").slice(0, 2000));
  await noter(u.id, "conseil_etat_modifie", ligneId);
  revalidatePath("/conseil");
}

/** Proposition de l'assistant, à partir de la fiche projet. Elle remplace le texte et reste à relire. */
export async function redigerAvecAssistant(ligneId: string) {
  const { u, a } = await exigerConseil();
  const ligne = await ligneModifiable(ligneId, a);
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, ligne.projetId));
  const ind = await db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, p.id)).orderBy(asc(schema.indicateurs.ordre));
  const donnees = [
    `Projet : ${p.titre}. ${p.description}`,
    `Indicateurs vérifiables : ${ind.map((i) => `${i.libelle} (${i.etat === "atteint" ? "atteint" : i.etat === "en_cours" ? "en cours" : "à venir"})`).join(" ; ")}`,
    `Fin prévue au dernier rapport : ${dateLongue(ligne.dateFinDernierRapport)} ; fin prévue aujourd'hui : ${dateLongue(ligne.nouvelleDateFin)}.`,
    `Texte actuel : ${ligne.etatAvancement}`,
  ].join("\n");
  const texte = await demanderIA(
    "Tu rédiges l'« état d'avancement » d'un projet pour le rapport mensuel au conseil d'administration d'une banque. Deux ou trois phrases, en français, ton factuel, sans titre. N'utilise que les données fournies ; n'invente ni date ni chiffre.",
    [{ role: "user", contenu: `<donnees>\n${donnees}\n</donnees>` }],
    300,
  );
  if (texte) await db.update(schema.lignesConseil).set({ etatAvancement: texte, redigeParIa: true }).where(eq(schema.lignesConseil.id, ligneId));
  await noter(u.id, "conseil_etat_ia", ligneId);
  revalidatePath("/conseil");
}

/** Seul un exécutif approuve le rapport au conseil. */
export async function approuver(rapportId: string) {
  const { u, a } = await exigerConseil();
  if (!a.toutVoir) throw new Error("Seul un exécutif approuve le rapport au conseil.");
  await approuverRapportConseil(rapportId, u.id);
  revalidatePath("/conseil");
}
