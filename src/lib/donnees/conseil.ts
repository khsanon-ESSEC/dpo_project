/** Rapport mensuel au conseil : projets stratégiques, au format du document Word habituel. */
import "server-only";
import { and, asc, desc, eq, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, dateLongue, premierDuMois } from "@/lib/dates";
import { noter } from "@/lib/journal";

export function moisCourant() {
  return premierDuMois(aujourdhui());
}

async function finAuDernierRapport(projetId: string, mois: string) {
  const [h] = await db
    .select()
    .from(schema.historiqueProjet)
    .where(and(eq(schema.historiqueProjet.projetId, projetId), lt(schema.historiqueProjet.mois, mois)))
    .orderBy(desc(schema.historiqueProjet.mois))
    .limit(1);
  return h ?? null;
}

/** État d'avancement préparé par règles simples, à relire (l'assistant peut le reformuler). */
async function etatParRegles(projet: typeof schema.projets.$inferSelect, ancienneFin: string | null) {
  const ind = await db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, projet.id)).orderBy(asc(schema.indicateurs.ordre));
  const atteints = ind.filter((i) => i.etat === "atteint").length;
  const enCours = ind.filter((i) => i.etat === "en_cours").map((i) => i.libelle.charAt(0).toLowerCase() + i.libelle.slice(1));
  const phrases = [`${atteints} indicateur${atteints > 1 ? "s" : ""} vérifiable${atteints > 1 ? "s" : ""} atteint${atteints > 1 ? "s" : ""} sur ${ind.length}.`];
  if (enCours.length) phrases.push(`En cours : ${enCours.join(" ; ")}.`);
  if (ancienneFin && projet.dateFinPrevue && ancienneFin !== projet.dateFinPrevue) {
    phrases.push(`La fin prévue passe du ${dateLongue(ancienneFin)} au ${dateLongue(projet.dateFinPrevue)}.`);
  }
  return phrases.join(" ");
}

export async function obtenirOuCreerRapportConseil(mois = moisCourant()) {
  let [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois)).limit(1);
  if (!r) {
    [r] = await db.insert(schema.rapportsConseil).values({ mois }).onConflictDoNothing().returning();
    if (!r) [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois)).limit(1);
    const projets = await db
      .select()
      .from(schema.projets)
      .where(and(eq(schema.projets.strategique, true), ne(schema.projets.statut, "finalise")))
      .orderBy(asc(schema.projets.creeLe));
    let ordre = 0;
    for (const p of projets) {
      ordre += 1;
      const dernier = await finAuDernierRapport(p.id, mois);
      await db
        .insert(schema.lignesConseil)
        .values({
          rapportId: r.id,
          projetId: p.id,
          ordre,
          etatAvancement: await etatParRegles(p, dernier?.dateFinPrevue ?? null),
          dateFinDernierRapport: dernier?.dateFinPrevue ?? null,
          nouvelleDateFin: p.dateFinPrevue,
          dateLancement: p.dateLancementPrevue,
          redigeParIa: false,
        })
        .onConflictDoNothing();
    }
  }
  return r;
}

export async function lignesConseil(rapportId: string, statut: string) {
  const lignes = await db
    .select({ ligne: schema.lignesConseil, projet: schema.projets })
    .from(schema.lignesConseil)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.lignesConseil.projetId))
    .where(eq(schema.lignesConseil.rapportId, rapportId))
    .orderBy(asc(schema.lignesConseil.ordre));
  // Tant que le rapport est un brouillon, les dates suivent les fiches projet.
  if (statut === "brouillon") {
    for (const { ligne, projet } of lignes) {
      if (ligne.nouvelleDateFin !== projet.dateFinPrevue || ligne.dateLancement !== projet.dateLancementPrevue) {
        await db
          .update(schema.lignesConseil)
          .set({ nouvelleDateFin: projet.dateFinPrevue, dateLancement: projet.dateLancementPrevue })
          .where(eq(schema.lignesConseil.id, ligne.id));
        ligne.nouvelleDateFin = projet.dateFinPrevue;
        ligne.dateLancement = projet.dateLancementPrevue;
      }
    }
  }
  return lignes;
}

export async function modifierEtat(ligneId: string, texte: string) {
  await db.update(schema.lignesConseil).set({ etatAvancement: texte.trim(), redigeParIa: false }).where(eq(schema.lignesConseil.id, ligneId));
}

/** Approuver : fige les dates et l'état dans l'historique, qui servira au rapport du mois suivant. */
export async function approuverRapportConseil(rapportId: string, parId: string) {
  const [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.id, rapportId));
  if (!r || r.statut !== "brouillon") return;
  const lignes = await lignesConseil(r.id, r.statut);
  await db.transaction(async (tx) => {
    for (const { ligne } of lignes) {
      await tx
        .insert(schema.historiqueProjet)
        .values({ projetId: ligne.projetId, mois: r.mois, dateFinPrevue: ligne.nouvelleDateFin, dateLancementPrevue: ligne.dateLancement, etatAvancement: ligne.etatAvancement })
        .onConflictDoUpdate({
          target: [schema.historiqueProjet.projetId, schema.historiqueProjet.mois],
          set: { dateFinPrevue: ligne.nouvelleDateFin, dateLancementPrevue: ligne.dateLancement, etatAvancement: ligne.etatAvancement },
        });
    }
    await tx.update(schema.rapportsConseil).set({ statut: "approuve", approuveParId: parId, approuveLe: new Date() }).where(eq(schema.rapportsConseil.id, r.id));
  });
  await noter(parId, "conseil_approuve", r.mois);
}
