/** Modèles de rapport : lecture, résolution par personne, édition par les administrateurs. */
import "server-only";
import { and, asc, count, desc, eq, inArray, max, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, subordonnesDirects, type OrgDonnees } from "@/lib/regles";
import {
  deplier,
  FORMULAIRE_PAR_DEFAUT,
  HORAIRES_PAR_DEFAUT,
  horairesDe,
  nouveauChamp,
  resoudreModele,
  validerChamps,
  validerHoraires,
  type Champ,
  type Genre,
  type Horaires,
  type ModeleRef,
  type Validation,
} from "@/lib/modeles";

type Execution = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Le modèle par défaut existe toujours : créé au besoin avec les quatre parties d'avant les modèles. */
export async function assurerModeleParDefaut() {
  const [m] = await db.select({ id: schema.modelesRapport.id }).from(schema.modelesRapport).where(eq(schema.modelesRapport.parDefaut, true)).limit(1);
  if (m) return m.id;
  return db.transaction(async (tx) => {
    const [cree] = await tx
      .insert(schema.modelesRapport)
      .values({ nom: "Rapport du vendredi", description: "Les quatre parties : fait, en cours, bloqué, la semaine prochaine.", genre: "individuel", parDefaut: true })
      .returning();
    await tx.insert(schema.versionsModele).values({ modeleId: cree.id, numero: 1, champs: FORMULAIRE_PAR_DEFAUT, statut: "publiee", note: "Les quatre parties d'origine.", publieeLe: new Date() });
    return cree.id;
  });
}

async function versionsPubliees(ids: string[]) {
  if (!ids.length) return new Map<string, typeof schema.versionsModele.$inferSelect>();
  const v = await db
    .select()
    .from(schema.versionsModele)
    .where(and(inArray(schema.versionsModele.modeleId, ids), eq(schema.versionsModele.statut, "publiee")))
    .orderBy(desc(schema.versionsModele.numero));
  const m = new Map<string, (typeof v)[number]>();
  for (const x of v) if (!m.has(x.modeleId)) m.set(x.modeleId, x);
  return m;
}

function equipesDe(org: OrgDonnees, personneId: string): string[] {
  const chaine: string[] = [];
  let e = org.personnes.get(personneId)?.equipeId ?? null;
  while (e && !chaine.includes(e)) {
    chaine.push(e);
    e = org.equipes.get(e)?.equipeParenteId ?? null;
  }
  return chaine;
}

/** Modèles en service (avec une version publiée) et affectations : de quoi résoudre le modèle de chacun. */
async function referentiel() {
  const modeles = await db.select().from(schema.modelesRapport);
  const affectations = await db.select().from(schema.affectationsModele);
  const publiees = await versionsPubliees(modeles.map((m) => m.id));
  const refs: ModeleRef[] = modeles.map((m) => ({ id: m.id, genre: m.genre, parDefaut: m.parDefaut, pourChefs: m.pourChefs, actif: m.actif && publiees.has(m.id) }));
  return { modeles, affectations, publiees, refs };
}

/** Le formulaire qu'une personne remplit cette semaine (« Mon travail » déplié pour un chef). */
export async function formulairePour(personneId: string): Promise<{ versionId: string | null; modele: { id: string; nom: string; numero: number; horaires: Horaires } | null; champs: Champ[] }> {
  await assurerModeleParDefaut();
  const org = await chargerOrganisation();
  const { modeles, affectations, publiees, refs } = await referentiel();
  const estChef = subordonnesDirects(org, personneId).length > 0;
  const r = resoudreModele(personneId, equipesDe(org, personneId), estChef, refs, affectations);
  const m = modeles.find((x) => x.id === r.modeleId);
  const v = r.modeleId ? publiees.get(r.modeleId) : undefined;
  if (!m || !v) return { versionId: null, modele: null, champs: FORMULAIRE_PAR_DEFAUT };
  const individuel = r.individuelId ? publiees.get(r.individuelId)?.champs : undefined;
  return { versionId: v.id, modele: { id: m.id, nom: m.nom, numero: v.numero, horaires: horairesDe(m.horaires) }, champs: deplier(v.champs, m.genre, individuel ?? FORMULAIRE_PAR_DEFAUT) };
}

/** Nom et numéro de la version d'un rapport (pour l'afficher). */
export async function versionDuRapport(versionId: string | null) {
  if (!versionId) return null;
  const [v] = await db
    .select({ numero: schema.versionsModele.numero, nom: schema.modelesRapport.nom, genre: schema.modelesRapport.genre, horaires: schema.modelesRapport.horaires })
    .from(schema.versionsModele)
    .innerJoin(schema.modelesRapport, eq(schema.modelesRapport.id, schema.versionsModele.modeleId))
    .where(eq(schema.versionsModele.id, versionId));
  return v ? { ...v, horaires: horairesDe(v.horaires) } : null;
}

/** Heures de la semaine d'un rapport : celles de son modèle (le modèle par défaut pour un rapport d'avant les modèles). */
export async function horairesDuRapport(r: { versionModeleId: string | null }): Promise<Horaires> {
  return (await versionDuRapport(r.versionModeleId))?.horaires ?? HORAIRES_PAR_DEFAUT;
}

export async function modifierHoraires(id: string, brut: unknown, parId: string) {
  const v = validerHoraires(brut);
  if (!v.ok) return { erreur: v.erreur } as const;
  await db.update(schema.modelesRapport).set({ horaires: v.horaires, majLe: new Date() }).where(eq(schema.modelesRapport.id, id));
  await noter(parId, "modele_horaires", id, v.horaires);
  return { ok: true } as const;
}

// ---------------------------------------------------------------------------
// Administration (les pages vérifient le rôle administrateur avant d'appeler)
// ---------------------------------------------------------------------------

/** Tous les modèles, avec ce qu'il faut pour les choisir : version, affectations, nombre de personnes. */
export async function listeModeles() {
  await assurerModeleParDefaut();
  const org = await chargerOrganisation();
  const { modeles, affectations, publiees, refs } = await referentiel();
  const brouillons = await db.select({ modeleId: schema.versionsModele.modeleId, numero: schema.versionsModele.numero }).from(schema.versionsModele).where(eq(schema.versionsModele.statut, "brouillon"));
  const utilisateurs = new Map<string, number>();
  for (const p of org.personnes.values()) {
    if (!p.actif) continue;
    const r = resoudreModele(p.id, equipesDe(org, p.id), subordonnesDirects(org, p.id).length > 0, refs, affectations);
    if (r.modeleId) utilisateurs.set(r.modeleId, (utilisateurs.get(r.modeleId) ?? 0) + 1);
  }
  return modeles
    .map((m) => {
      const v = publiees.get(m.id);
      const aff = affectations.filter((a) => a.modeleId === m.id);
      return {
        ...m,
        courante: v ? { numero: v.numero, publieeLe: v.publieeLe, nbChamps: v.champs.length } : null,
        brouillon: brouillons.find((b) => b.modeleId === m.id)?.numero ?? null,
        equipes: aff.filter((a) => a.equipeId).map((a) => org.equipes.get(a.equipeId!)?.nom ?? ""),
        personnes: aff.filter((a) => a.personneId).map((a) => (org.personnes.has(a.personneId!) ? nomComplet(org.personnes.get(a.personneId!)!) : "")),
        nbPersonnes: utilisateurs.get(m.id) ?? 0,
      };
    })
    .sort((a, b) => Number(b.parDefaut) - Number(a.parDefaut) || Number(a.genre === "chef") - Number(b.genre === "chef") || a.nom.localeCompare(b.nom, "fr"));
}

export type ModeleListe = Awaited<ReturnType<typeof listeModeles>>[number];

export async function modeleDetaille(id: string) {
  const [m] = await db.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, id)).limit(1);
  if (!m) return null;
  const org = await chargerOrganisation();
  const versions = await db.select().from(schema.versionsModele).where(eq(schema.versionsModele.modeleId, id)).orderBy(desc(schema.versionsModele.numero));
  const usages = versions.length
    ? await db
        .select({ versionId: schema.rapportsHebdo.versionModeleId, n: count() })
        .from(schema.rapportsHebdo)
        .where(and(inArray(schema.rapportsHebdo.versionModeleId, versions.map((v) => v.id)), eq(schema.rapportsHebdo.statut, "envoye")))
        .groupBy(schema.rapportsHebdo.versionModeleId)
    : [];
  const affectations = await db.select().from(schema.affectationsModele).where(eq(schema.affectationsModele.modeleId, id));
  const toutes = await db.select().from(schema.affectationsModele);
  const autres = await db.select({ id: schema.modelesRapport.id, nom: schema.modelesRapport.nom }).from(schema.modelesRapport).where(ne(schema.modelesRapport.id, id));
  const nomModele = new Map(autres.map((x) => [x.id, x.nom]));
  const brouillon = versions.find((v) => v.statut === "brouillon") ?? null;
  const courante = versions.find((v) => v.statut === "publiee") ?? null;
  const qui = (pid: string | null) => (pid && org.personnes.get(pid) ? nomComplet(org.personnes.get(pid)!) : null);
  return {
    modele: m,
    brouillon,
    courante,
    /** Ce que l'éditeur montre : le brouillon s'il existe, sinon la version en service. */
    champs: (brouillon ?? courante)?.champs ?? [],
    versions: versions.map((v) => ({
      id: v.id,
      numero: v.numero,
      statut: v.statut,
      note: v.note,
      creeLe: v.creeLe,
      publieeLe: v.publieeLe,
      publieePar: qui(v.publieeParId),
      creeePar: qui(v.creeeParId),
      rapports: Number(usages.find((u) => u.versionId === v.id)?.n ?? 0),
    })),
    equipes: [...org.equipes.values()]
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      .map((e) => {
        const a = toutes.find((x) => x.equipeId === e.id);
        return { id: e.id, nom: e.nom, affectationId: a?.id ?? null, ici: a?.modeleId === id, ailleurs: a && a.modeleId !== id ? (nomModele.get(a.modeleId) ?? "") : null };
      }),
    personnes: affectations
      .filter((a) => a.personneId)
      .map((a) => ({ affectationId: a.id, id: a.personneId!, nom: qui(a.personneId) ?? "" })),
    personnesOptions: [...org.personnes.values()]
      .filter((p) => p.actif)
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      .map((p) => ({ id: p.id, nom: nomComplet(p), ailleurs: (() => {
        const a = toutes.find((x) => x.personneId === p.id);
        return a && a.modeleId !== id ? (nomModele.get(a.modeleId) ?? "") : null;
      })() })),
    modelesIndividuels: (await db.select({ id: schema.modelesRapport.id, nom: schema.modelesRapport.nom }).from(schema.modelesRapport).where(eq(schema.modelesRapport.genre, "individuel"))).map((x) => x),
  };
}

/** Champs pour un modèle neuf : copiés d'un modèle existant, ou un départ selon le genre. */
function champsDeDepart(genre: Genre): Champ[] {
  if (genre === "individuel") return FORMULAIRE_PAR_DEFAUT.map((c) => ({ ...c }));
  return [
    { ...nouveauChamp("mon_travail", []) },
    { id: "mon_equipe", type: "intertitre", libelle: "Mon équipe", aide: "Préparé à partir des rapports reçus." },
    { id: "a_decider", type: "reprise", libelle: "À décider ou débloquer", reprise: "a_decider", visibilite: "tous", aide: "« Remonter » met l'élément en tête du rapport de votre supérieur." },
    { id: "sante_equipe", type: "reprise", libelle: "Santé des projets de l'équipe", reprise: "sante", visibilite: "tous" },
    { id: "charge_equipe", type: "reprise", libelle: "Charge de l'équipe", reprise: "charge", visibilite: "tous" },
    { id: "fait_equipe", type: "reprise", libelle: "Fait cette semaine", reprise: "fait", visibilite: "tous" },
    { id: "prochaine_equipe", type: "reprise", libelle: "La semaine prochaine", reprise: "prochaine", visibilite: "tous" },
  ];
}

export async function creerModele(nom: string, genre: Genre, depuisId: string | null, parId: string) {
  const n = nom.trim().slice(0, 80);
  if (!n) return { erreur: "Donnez un nom au modèle.", id: undefined };
  let champs = champsDeDepart(genre);
  let horaires: Horaires | null = null;
  if (depuisId) {
    const [src] = await db.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, depuisId));
    const v = src ? (await versionsPubliees([src.id])).get(src.id) : undefined;
    if (src && v && src.genre === genre) champs = v.champs;
    if (src?.horaires) horaires = horairesDe(src.horaires);
  }
  const id = await db.transaction(async (tx) => {
    const [m] = await tx.insert(schema.modelesRapport).values({ nom: n, genre, horaires }).returning();
    await tx.insert(schema.versionsModele).values({ modeleId: m.id, numero: 1, champs, statut: "brouillon", creeeParId: parId });
    return m.id;
  });
  await noter(parId, "modele_cree", id, { nom: n, genre });
  return { id, erreur: undefined };
}

/** Le brouillon du modèle : créé au besoin, copie de la version en service. */
async function brouillon(tx: Execution, modeleId: string, parId: string) {
  const [b] = await tx.select().from(schema.versionsModele).where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "brouillon"))).limit(1);
  if (b) return b;
  const [{ n }] = await tx.select({ n: max(schema.versionsModele.numero) }).from(schema.versionsModele).where(eq(schema.versionsModele.modeleId, modeleId));
  const [courante] = await tx
    .select()
    .from(schema.versionsModele)
    .where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "publiee")))
    .orderBy(desc(schema.versionsModele.numero))
    .limit(1);
  const [cree] = await tx
    .insert(schema.versionsModele)
    .values({ modeleId, numero: (n ?? 0) + 1, champs: courante?.champs ?? [], statut: "brouillon", creeeParId: parId })
    .returning();
  return cree;
}

/** Remplace les champs du brouillon après validation. */
export async function enregistrerChamps(modeleId: string, champs: unknown, parId: string): Promise<Validation> {
  const [m] = await db.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, modeleId));
  if (!m) return { ok: false, erreur: "Modèle introuvable." };
  const v = validerChamps(champs, m.genre);
  if (!v.ok) return v;
  await db.transaction(async (tx) => {
    const b = await brouillon(tx, modeleId, parId);
    await tx.update(schema.versionsModele).set({ champs: v.champs }).where(eq(schema.versionsModele.id, b.id));
    await tx.update(schema.modelesRapport).set({ majLe: new Date() }).where(eq(schema.modelesRapport.id, modeleId));
  });
  return v;
}

/** Champs en cours d'édition (brouillon, ou version en service). */
export async function champsEnEdition(modeleId: string): Promise<{ genre: Genre; champs: Champ[] } | null> {
  const [m] = await db.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, modeleId));
  if (!m) return null;
  const v = await db
    .select()
    .from(schema.versionsModele)
    .where(and(eq(schema.versionsModele.modeleId, modeleId), inArray(schema.versionsModele.statut, ["brouillon", "publiee"])))
    .orderBy(desc(schema.versionsModele.numero));
  return { genre: m.genre, champs: (v.find((x) => x.statut === "brouillon") ?? v[0])?.champs ?? [] };
}

/** Publier le brouillon : il devient la version en service ; la précédente est archivée. */
export async function publierBrouillon(modeleId: string, note: string, parId: string) {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.versionsModele).where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "brouillon")));
    if (!b) return { erreur: "Rien à publier." } as const;
    const [m] = await tx.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, modeleId));
    const v = validerChamps(b.champs, m.genre);
    if (!v.ok) return { erreur: v.erreur } as const;
    await tx.update(schema.versionsModele).set({ statut: "archivee" }).where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "publiee")));
    await tx
      .update(schema.versionsModele)
      .set({ statut: "publiee", champs: v.champs, note: note.trim().slice(0, 300), publieeLe: new Date(), publieeParId: parId })
      .where(eq(schema.versionsModele.id, b.id));
    await noter(parId, "modele_publie", modeleId, { version: b.numero });
    return { numero: b.numero } as const;
  });
}

export async function abandonnerBrouillon(modeleId: string, parId: string) {
  const [publiee] = await db.select({ id: schema.versionsModele.id }).from(schema.versionsModele).where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "publiee")));
  if (!publiee) return; // un modèle jamais publié garde son brouillon
  await db.delete(schema.versionsModele).where(and(eq(schema.versionsModele.modeleId, modeleId), eq(schema.versionsModele.statut, "brouillon")));
  await noter(parId, "modele_brouillon_abandonne", modeleId);
}

export async function modifierModele(id: string, d: { nom: string; description: string; actif: boolean; parDefaut: boolean; pourChefs: boolean }, parId: string) {
  const [m] = await db.select().from(schema.modelesRapport).where(eq(schema.modelesRapport.id, id));
  if (!m) return { erreur: "Modèle introuvable." } as const;
  const nom = d.nom.trim().slice(0, 80);
  if (!nom) return { erreur: "Donnez un nom au modèle." } as const;
  const parDefaut = m.genre === "individuel" && (d.parDefaut || m.parDefaut); // le défaut se déplace, il ne se retire pas
  const pourChefs = m.genre === "chef" && d.pourChefs;
  if (m.parDefaut && !d.actif) return { erreur: "Le modèle par défaut reste actif : désignez-en un autre d'abord." } as const;
  await db.transaction(async (tx) => {
    if (parDefaut && !m.parDefaut) await tx.update(schema.modelesRapport).set({ parDefaut: false }).where(eq(schema.modelesRapport.parDefaut, true));
    if (pourChefs && !m.pourChefs) await tx.update(schema.modelesRapport).set({ pourChefs: false }).where(eq(schema.modelesRapport.pourChefs, true));
    await tx.update(schema.modelesRapport).set({ nom, description: d.description.trim().slice(0, 300), actif: d.actif, parDefaut, pourChefs, majLe: new Date() }).where(eq(schema.modelesRapport.id, id));
  });
  await noter(parId, "modele_modifie", id, { nom, actif: d.actif, parDefaut, pourChefs });
  return { ok: true } as const;
}

export async function affecterEquipe(modeleId: string, equipeId: string, parId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.affectationsModele).where(eq(schema.affectationsModele.equipeId, equipeId));
    await tx.insert(schema.affectationsModele).values({ modeleId, equipeId });
  });
  await noter(parId, "modele_affecte", modeleId, { equipe: equipeId });
}

export async function affecterPersonne(modeleId: string, personneId: string, parId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.affectationsModele).where(eq(schema.affectationsModele.personneId, personneId));
    await tx.insert(schema.affectationsModele).values({ modeleId, personneId });
  });
  await noter(parId, "modele_affecte", modeleId, { personne: personneId });
}

export async function retirerAffectation(affectationId: string, parId: string) {
  await db.delete(schema.affectationsModele).where(eq(schema.affectationsModele.id, affectationId));
  await noter(parId, "modele_affectation_retiree", affectationId);
}

export async function modelesActifs() {
  return db.select().from(schema.modelesRapport).orderBy(asc(schema.modelesRapport.nom));
}
