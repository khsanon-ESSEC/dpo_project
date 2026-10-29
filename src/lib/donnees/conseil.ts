/**
 * Rapports au conseil, au format du document Word habituel :
 * - le rapport mensuel (projets stratégiques), approuvé par un exécutif, qui fige les dates du mois ;
 * - les rapports ponctuels, faits à tout moment pour une demande ou un événement imprévu : un titre,
 *   leur objet, les projets choisis, la période couverte. Ils ne changent pas l'historique mensuel.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, dateCourte, dateLongue, premierDuMois } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

export function moisCourant() {
  return premierDuMois(aujourdhui());
}

/** Un mois de rapport possible : un vrai mois, depuis 2020, jusqu'au mois prochain (pas de rapport créé au hasard). */
export function moisValide(m: string | undefined | null): m is string {
  if (!m || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(m)) return false;
  return m >= "2020-01-01" && m <= premierDuMois(aujourdhui(), 1);
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
  const minuscule = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const enCours = ind.filter((i) => i.etat === "en_cours" || i.etat === "pret").map((i) => `${minuscule(i.libelle)}${i.etat === "pret" ? " (prêt à valider)" : ""}`);
  const phrases = [`${atteints} livrable${atteints > 1 ? "s" : ""} validé${atteints > 1 ? "s" : ""} sur ${ind.length}.`];
  if (enCours.length) phrases.push(`En cours : ${enCours.join(" ; ")}.`);
  // Le prochain livrable attendu, avec sa date.
  const prochain = ind.filter((i) => i.etat !== "atteint" && i.prevuLe).sort((x, y) => x.prevuLe!.localeCompare(y.prevuLe!))[0];
  if (prochain) phrases.push(`Prochain livrable : ${minuscule(prochain.libelle)}, prévu le ${dateLongue(prochain.prevuLe!)}.`);
  if (ancienneFin && projet.dateFinPrevue && ancienneFin !== projet.dateFinPrevue) {
    // Le motif du dernier report vers cette date, s'il a été noté.
    const [r] = await db
      .select({ motif: schema.reportsFinProjet.motif })
      .from(schema.reportsFinProjet)
      .where(and(eq(schema.reportsFinProjet.projetId, projet.id), eq(schema.reportsFinProjet.apres, projet.dateFinPrevue)))
      .orderBy(desc(schema.reportsFinProjet.creeLe))
      .limit(1);
    const motif = r?.motif ? ` : ${r.motif.charAt(0).toLowerCase()}${r.motif.slice(1).replace(/[.]$/, "")}` : "";
    phrases.push(`La fin prévue passe du ${dateLongue(ancienneFin)} au ${dateLongue(projet.dateFinPrevue)}${motif}.`);
  }
  return phrases.join(" ");
}

/** Un projet du rapport mensuel : stratégique, de la DPO, accepté, ni finalisé ni archivé. */
export function entreAuRapportMensuel(p: Pick<typeof schema.projets.$inferSelect, "strategique" | "division" | "statut" | "archiveLe">): boolean {
  return p.strategique && p.division === "" && p.statut !== "finalise" && p.statut !== "requete" && p.statut !== "refuse" && !p.archiveLe;
}

/** Le texte automatique d'un projet pour le rapport d'un mois (livrables, reports de la fin). */
export async function texteAutomatique(p: typeof schema.projets.$inferSelect, mois: string): Promise<string> {
  return etatParRegles(p, (await finAuDernierRapport(p.id, mois))?.dateFinPrevue ?? null);
}

/** Les états d'avancement écrits par les chefs de projet pour un mois (src/lib/donnees/avancement-conseil.ts). */
async function avancementsDuMois(mois: string) {
  const l = await db.select().from(schema.avancementsConseil).where(eq(schema.avancementsConseil.mois, mois));
  return new Map(l.map((x) => [x.projetId, x]));
}

export async function obtenirOuCreerRapportConseil(mois = moisCourant()) {
  let [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois)).limit(1);
  if (!r) {
    [r] = await db.insert(schema.rapportsConseil).values({ genre: "mensuel", mois }).onConflictDoNothing().returning();
    if (!r) [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois)).limit(1);
    const projets = await db
      .select()
      .from(schema.projets)
      // Les projets d'autres divisions n'entrent pas dans le rapport mensuel de la DPO (on peut les choisir dans un rapport ponctuel).
      .where(and(eq(schema.projets.strategique, true), eq(schema.projets.division, ""), ne(schema.projets.statut, "finalise"), ne(schema.projets.statut, "requete"), ne(schema.projets.statut, "refuse"), isNull(schema.projets.archiveLe)))
      .orderBy(asc(schema.projets.creeLe));
    let ordre = 0;
    // Ce que les chefs de projet ont déjà écrit pour ce mois, sur la fiche de leur projet.
    const ecrits = await avancementsDuMois(mois);
    for (const p of projets) {
      ordre += 1;
      const dernier = await finAuDernierRapport(p.id, mois);
      const chef = ecrits.get(p.id);
      await db
        .insert(schema.lignesConseil)
        .values({
          rapportId: r.id,
          projetId: p.id,
          ordre,
          etatAvancement: chef ? chef.texte : await etatParRegles(p, dernier?.dateFinPrevue ?? null),
          dateFinDernierRapport: dernier?.dateFinPrevue ?? null,
          nouvelleDateFin: p.dateFinPrevue,
          dateLancement: p.dateLancementPrevue,
          redigeParIa: false,
          ...(chef ? { source: "chef" as const, sourceParId: chef.majParId, sourceLe: chef.majLe } : {}),
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
  // Tant que le rapport est un brouillon, les dates suivent les fiches projet ; et, dans le rapport mensuel, l'état
  // d'avancement suit ce que le chef de projet a écrit pour le mois, sauf si la direction l'a corrigé ici.
  if (statut === "brouillon") {
    const [r] = await db.select({ genre: schema.rapportsConseil.genre, mois: schema.rapportsConseil.mois }).from(schema.rapportsConseil).where(eq(schema.rapportsConseil.id, rapportId));
    const ecrits = r?.genre === "mensuel" && r.mois ? await avancementsDuMois(r.mois) : new Map<string, typeof schema.avancementsConseil.$inferSelect>();
    for (const { ligne } of lignes) {
      const chef = ecrits.get(ligne.projetId);
      if (!chef || (ligne.source !== "regles" && ligne.source !== "chef")) continue;
      if (ligne.source === "chef" && ligne.etatAvancement === chef.texte && ligne.sourceParId === chef.majParId) continue;
      await db.update(schema.lignesConseil).set({ etatAvancement: chef.texte, source: "chef", sourceParId: chef.majParId, sourceLe: chef.majLe, redigeParIa: false }).where(eq(schema.lignesConseil.id, ligne.id));
      Object.assign(ligne, { etatAvancement: chef.texte, source: "chef", sourceParId: chef.majParId, sourceLe: chef.majLe, redigeParIa: false });
    }
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
  // Qui a écrit l'état d'avancement (le chef de projet, la direction, l'assistant à sa demande).
  const ids = new Set(lignes.map((l) => l.ligne.sourceParId).filter((x): x is string => !!x));
  const org = ids.size ? await chargerOrganisation() : null;
  return lignes.map((l) => {
    const x = l.ligne.sourceParId ? org?.personnes.get(l.ligne.sourceParId) : undefined;
    return { ...l, auteurEtat: x ? nomComplet(x) : null };
  });
}

/** La direction corrige l'état d'avancement dans le rapport : sa version l'emporte sur celle du chef de projet. */
export async function modifierEtat(ligneId: string, texte: string, parId: string | null = null) {
  await db.update(schema.lignesConseil).set({ etatAvancement: texte.trim(), redigeParIa: false, source: "direction", sourceParId: parId, sourceLe: new Date() }).where(eq(schema.lignesConseil.id, ligneId));
}

/**
 * Approuver : fige les dates et les états. Le rapport mensuel les inscrit dans l'historique, qui servira
 * de « dernier rapport » au mois suivant ; un rapport ponctuel ne change pas cet historique.
 */
export async function approuverRapportConseil(rapportId: string, parId: string) {
  const [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.id, rapportId));
  if (!r || r.statut !== "brouillon") return;
  const lignes = await lignesConseil(r.id, r.statut);
  if (r.genre === "ponctuel" || !r.mois) {
    await db.update(schema.rapportsConseil).set({ statut: "approuve", approuveParId: parId, approuveLe: new Date() }).where(eq(schema.rapportsConseil.id, r.id));
    await noter(parId, "conseil_ponctuel_approuve", r.id, { titre: r.titre });
    return;
  }
  const mois = r.mois;
  await db.transaction(async (tx) => {
    for (const { ligne } of lignes) {
      await tx
        .insert(schema.historiqueProjet)
        .values({ projetId: ligne.projetId, mois, dateFinPrevue: ligne.nouvelleDateFin, dateLancementPrevue: ligne.dateLancement, etatAvancement: ligne.etatAvancement })
        .onConflictDoUpdate({
          target: [schema.historiqueProjet.projetId, schema.historiqueProjet.mois],
          set: { dateFinPrevue: ligne.nouvelleDateFin, dateLancementPrevue: ligne.dateLancement, etatAvancement: ligne.etatAvancement },
        });
    }
    await tx.update(schema.rapportsConseil).set({ statut: "approuve", approuveParId: parId, approuveLe: new Date() }).where(eq(schema.rapportsConseil.id, r.id));
  });
  await noter(parId, "conseil_approuve", r.mois);
}

// ---------------------------------------------------------------------------
// Rapports ponctuels
// ---------------------------------------------------------------------------

/** État du projet au dernier rapport mensuel approuvé (jusqu'à aujourd'hui). */
async function dernierEtat(projetId: string, jour = aujourdhui()) {
  const [h] = await db
    .select()
    .from(schema.historiqueProjet)
    .where(and(eq(schema.historiqueProjet.projetId, projetId), lte(schema.historiqueProjet.mois, jour)))
    .orderBy(desc(schema.historiqueProjet.mois))
    .limit(1);
  return h ?? null;
}

/** Ce qui s'est passé sur le projet depuis le début de la période : tâches terminées, blocages en cours. */
export async function faitsDepuis(projetId: string, depuis: string) {
  const debut = sql`(${depuis}::date)::timestamp at time zone ${TZ}`;
  const terminees = await db
    .select({ titre: schema.taches.titre })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), eq(schema.taches.statut, "faite"), sql`${schema.taches.termineeLe} >= ${debut}`, isNull(schema.taches.annuleeLe)))
    .orderBy(desc(schema.taches.termineeLe));
  const bloquees = await db
    .select({ titre: schema.taches.titre, blocage: schema.taches.blocage })
    .from(schema.taches)
    .where(and(eq(schema.taches.projetId, projetId), eq(schema.taches.statut, "bloquee"), isNull(schema.taches.annuleeLe)));
  return { terminees: terminees.map((t) => t.titre), bloquees };
}

async function etatPonctuel(projet: typeof schema.projets.$inferSelect, depuis: string, ancienneFin: string | null) {
  const base = await etatParRegles(projet, ancienneFin);
  const { terminees, bloquees } = await faitsDepuis(projet.id, depuis);
  const n = terminees.length;
  const phrases = [base];
  phrases.push(
    n
      ? `Depuis le ${dateCourte(depuis)} : ${n} tâche${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""}, dont ${terminees
          .slice(0, 2)
          .map((t) => `« ${t} »`)
          .join(" et ")}.`
      : `Aucune tâche terminée depuis le ${dateCourte(depuis)}.`,
  );
  if (bloquees.length) phrases.push(`Bloqué : ${bloquees.slice(0, 2).map((b) => `« ${b.titre} »${b.blocage ? ` (${b.blocage.replace(/[.\s]+$/, "")})` : ""}`).join(" ; ")}.`);
  return phrases.join(" ");
}

export type NouveauPonctuel = { titre: string; objet: string; depuis: string; projetIds: string[] };

/** Crée un rapport ponctuel sur des projets que la personne peut voir. */
export async function creerRapportPonctuel(d: NouveauPonctuel, parId: string, visibles: Set<string> | "tous"): Promise<{ id: string } | { erreur: string }> {
  const titre = d.titre.trim().slice(0, 120);
  if (!titre) return { erreur: "Donnez un titre au rapport (la demande ou l'événement)." };
  const jour = aujourdhui();
  const depuis = /^\d{4}-\d{2}-\d{2}$/.test(d.depuis) && d.depuis <= jour ? d.depuis : premierDuMois(jour);
  const ids = [...new Set(d.projetIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id) && (visibles === "tous" || visibles.has(id)));
  if (!ids.length) return { erreur: "Choisissez au moins un projet." };
  if (ids.length > 40) return { erreur: "Quarante projets au plus." };
  const projets = await db.select().from(schema.projets).where(inArray(schema.projets.id, ids));
  projets.sort((a, b) => Number(b.strategique) - Number(a.strategique) || a.code.localeCompare(b.code, "fr"));
  const lignes: Omit<typeof schema.lignesConseil.$inferInsert, "rapportId" | "ordre">[] = [];
  for (const p of projets) {
    const dernier = await dernierEtat(p.id, jour);
    lignes.push({ projetId: p.id, etatAvancement: await etatPonctuel(p, depuis, dernier?.dateFinPrevue ?? null), dateFinDernierRapport: dernier?.dateFinPrevue ?? null, nouvelleDateFin: p.dateFinPrevue, dateLancement: p.dateLancementPrevue });
  }
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.rapportsConseil).values({ genre: "ponctuel", titre, objet: d.objet.trim().slice(0, 1500), dateRapport: jour, depuis, creeParId: parId }).returning();
    await tx.insert(schema.lignesConseil).values(lignes.map((l, i) => ({ ...l, rapportId: r.id, ordre: i + 1 })));
    return r.id;
  });
  await noter(parId, "conseil_ponctuel_cree", id, { titre, projets: ids.length, depuis });
  return { id };
}

export async function rapportConseil(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.id, id)).limit(1);
  return r ?? null;
}

/** Rapports ponctuels qui touchent au moins un projet visible (ou que la personne a créés), du plus récent au plus ancien. */
export async function rapportsPonctuels(visibles: Set<string> | "tous", moiId: string) {
  const rapports = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.genre, "ponctuel")).orderBy(desc(schema.rapportsConseil.dateRapport), desc(schema.rapportsConseil.creeLe));
  if (!rapports.length) return [];
  const lignes = await db
    .select({ rapportId: schema.lignesConseil.rapportId, projetId: schema.lignesConseil.projetId, code: schema.projets.code })
    .from(schema.lignesConseil)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.lignesConseil.projetId))
    .where(inArray(schema.lignesConseil.rapportId, rapports.map((r) => r.id)))
    .orderBy(asc(schema.lignesConseil.ordre));
  const org = await chargerOrganisation();
  return rapports
    .map((r) => {
      const siennes = lignes.filter((l) => l.rapportId === r.id && (visibles === "tous" || visibles.has(l.projetId)));
      const auteur = r.creeParId ? org.personnes.get(r.creeParId) : undefined;
      return { ...r, codes: siennes.map((l) => l.code), auteur: auteur ? nomComplet(auteur) : null };
    })
    .filter((r) => r.codes.length > 0 || r.creeParId === moiId);
}

export async function ajouterProjetAuRapport(rapportId: string, projetId: string, parId: string) {
  const r = await rapportConseil(rapportId);
  if (!r || r.genre !== "ponctuel" || r.statut !== "brouillon") return;
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return;
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${schema.lignesConseil.ordre}), 0)` }).from(schema.lignesConseil).where(eq(schema.lignesConseil.rapportId, rapportId));
  const dernier = await dernierEtat(p.id);
  await db
    .insert(schema.lignesConseil)
    .values({ rapportId, projetId, ordre: Number(m) + 1, etatAvancement: await etatPonctuel(p, r.depuis ?? premierDuMois(aujourdhui()), dernier?.dateFinPrevue ?? null), dateFinDernierRapport: dernier?.dateFinPrevue ?? null, nouvelleDateFin: p.dateFinPrevue, dateLancement: p.dateLancementPrevue })
    .onConflictDoNothing();
  await noter(parId, "conseil_ponctuel_projet_ajoute", rapportId, { projet: projetId });
}

export async function retirerLigneDuRapport(ligneId: string, parId: string) {
  const [l] = await db
    .select({ ligne: schema.lignesConseil, rapport: schema.rapportsConseil })
    .from(schema.lignesConseil)
    .innerJoin(schema.rapportsConseil, eq(schema.rapportsConseil.id, schema.lignesConseil.rapportId))
    .where(eq(schema.lignesConseil.id, ligneId));
  if (!l || l.rapport.genre !== "ponctuel" || l.rapport.statut !== "brouillon") return;
  await db.delete(schema.lignesConseil).where(eq(schema.lignesConseil.id, ligneId));
  await noter(parId, "conseil_ponctuel_projet_retire", l.rapport.id, { projet: l.ligne.projetId });
}

export async function modifierObjet(rapportId: string, d: { titre: string; objet: string }, parId: string) {
  const r = await rapportConseil(rapportId);
  if (!r || r.genre !== "ponctuel" || r.statut !== "brouillon") return;
  const titre = d.titre.trim().slice(0, 120) || r.titre;
  await db.update(schema.rapportsConseil).set({ titre, objet: d.objet.trim().slice(0, 1500) }).where(eq(schema.rapportsConseil.id, rapportId));
  await noter(parId, "conseil_ponctuel_modifie", rapportId, { titre });
}

/** Projets qu'on peut mettre dans un rapport ponctuel : ceux que la personne voit, en cours ou non, stratégiques d'abord. */
export async function projetsPourRapport(visibles: Set<string> | "tous") {
  const projets = await db
    .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, strategique: schema.projets.strategique, statut: schema.projets.statut, division: schema.projets.division })
    .from(schema.projets)
    .orderBy(asc(schema.projets.code));
  return projets
    .filter((p) => p.statut !== "requete" && p.statut !== "refuse")
    .filter((p) => visibles === "tous" || visibles.has(p.id))
    .sort((a, b) => Number(b.strategique) - Number(a.strategique) || Number(a.statut === "finalise") - Number(b.statut === "finalise") || a.code.localeCompare(b.code, "fr"));
}

/**
 * Tous les rapports au conseil déjà faits, mensuels et ponctuels, du plus récent au plus ancien : ceux qui
 * touchent un projet visible (ou que la personne a créés). Le rapport du mois en cours n'y est que s'il est approuvé.
 */
export async function historiqueConseil(visibles: Set<string> | "tous", moiId: string) {
  const courant = moisCourant();
  const rapports = await db.select().from(schema.rapportsConseil);
  if (!rapports.length) return [];
  const lignes = await db
    .select({ rapportId: schema.lignesConseil.rapportId, projetId: schema.lignesConseil.projetId, code: schema.projets.code, ancienne: schema.lignesConseil.dateFinDernierRapport, nouvelle: schema.lignesConseil.nouvelleDateFin })
    .from(schema.lignesConseil)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.lignesConseil.projetId))
    .where(inArray(schema.lignesConseil.rapportId, rapports.map((r) => r.id)))
    .orderBy(asc(schema.lignesConseil.ordre));
  const org = await chargerOrganisation();
  const nom = (id: string | null) => (id && org.personnes.get(id) ? nomComplet(org.personnes.get(id)!) : null);
  return rapports
    .filter((r) => !(r.genre === "mensuel" && r.mois && r.mois >= courant && r.statut === "brouillon"))
    .map((r) => {
      const siennes = lignes.filter((l) => l.rapportId === r.id && (visibles === "tous" || visibles.has(l.projetId)));
      return {
        id: r.id,
        genre: r.genre,
        mois: r.mois,
        titre: r.titre,
        date: r.genre === "mensuel" ? r.mois! : (r.dateRapport ?? r.creeLe.toISOString().slice(0, 10)),
        statut: r.statut,
        approuveLe: r.approuveLe,
        approuvePar: nom(r.approuveParId),
        auteur: nom(r.creeParId),
        creeParId: r.creeParId,
        codes: siennes.map((l) => l.code),
        datesChangees: siennes.filter((l) => l.ancienne && l.nouvelle && l.ancienne !== l.nouvelle).length,
      };
    })
    .filter((r) => r.codes.length > 0 || r.creeParId === moiId)
    .sort((x, y) => y.date.localeCompare(x.date));
}

/** Le rapport mensuel d'un mois, s'il existe (sans le créer). */
export async function rapportDuMois(mois: string) {
  const [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois)).limit(1);
  return r ?? null;
}

/** Mois des rapports mensuels existants, du plus ancien au plus récent (pour aller de l'un à l'autre). */
export async function moisDesRapports(): Promise<string[]> {
  const l = await db.select({ mois: schema.rapportsConseil.mois }).from(schema.rapportsConseil).where(eq(schema.rapportsConseil.genre, "mensuel")).orderBy(asc(schema.rapportsConseil.mois));
  return l.map((x) => x.mois!).filter(Boolean);
}

/**
 * Comparer deux rapports (demandé le 29 octobre 2026) : les lignes d'un rapport, en lecture seule (un brouillon
 * montre les dates des fiches projet, sans rien écrire), limitées aux projets que la personne voit.
 */
export async function lignesComparables(rapportId: string, statut: string, visibles: Set<string> | "tous") {
  const lignes = await db
    .select({ ligne: schema.lignesConseil, projet: schema.projets })
    .from(schema.lignesConseil)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.lignesConseil.projetId))
    .where(eq(schema.lignesConseil.rapportId, rapportId))
    .orderBy(asc(schema.lignesConseil.ordre));
  return lignes
    .filter((l) => visibles === "tous" || visibles.has(l.projet.id))
    .map(({ ligne, projet }) => ({
      projetId: projet.id,
      code: projet.code,
      titre: projet.titre,
      programme: projet.programme,
      ordre: ligne.ordre,
      etat: ligne.etatAvancement,
      fin: statut === "brouillon" ? projet.dateFinPrevue : ligne.nouvelleDateFin,
      lancement: statut === "brouillon" ? projet.dateLancementPrevue : ligne.dateLancement,
    }));
}

/** Les rapports qu'on peut comparer : ceux de l'historique, et le rapport du mois en cours s'il existe (brouillon). */
export async function rapportsComparables(visibles: Set<string> | "tous", moiId: string) {
  const liste = await historiqueConseil(visibles, moiId);
  const courant = await rapportDuMois(moisCourant());
  if (courant && !liste.some((r) => r.id === courant.id)) {
    const lignes = await lignesComparables(courant.id, courant.statut, visibles);
    if (lignes.length)
      liste.unshift({
        id: courant.id,
        genre: "mensuel",
        mois: courant.mois,
        titre: courant.titre,
        date: courant.mois!,
        statut: courant.statut,
        approuveLe: courant.approuveLe,
        approuvePar: null,
        auteur: null,
        creeParId: courant.creeParId,
        codes: lignes.map((l) => l.code),
        datesChangees: 0,
      });
  }
  return liste.sort((x, y) => y.date.localeCompare(x.date));
}
