/**
 * Rapport de la semaine : formulaire du modèle, brouillon préparé à partir des tâches, reprise des
 * rapports reçus (rapport de chef), envoi, lecture filtrée champ par champ.
 */
import "server-only";
import { reunionsDeLaSemaine } from "./reunions";
import { and, asc, desc, eq, inArray, isNull, lt, max, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui, dateLocale, lundiDe, maintenantLocal } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { estSuperieurDe, initiales, membresDeLaDirection, nomComplet, peutVoirRapportComplet, resoudreSuperieur, subordonnesDirects, voitTout } from "@/lib/regles";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { formulairePour, horairesDuRapport, versionDuRapport } from "@/lib/donnees/modeles";
import { syntheseParRegles, suggestionsDecision, type ElementSynthese } from "@/lib/suggestions";
import {
  additionnerComptes,
  champsManquants,
  comptesVides,
  estDecoratif,
  etapeRapport,
  FORMULAIRE_PAR_DEFAUT,
  HORAIRES_PAR_DEFAUT,
  libelleRessenti,
  libelleSante,
  lireComptes,
  pireSante,
  ressentiPropose,
  visibiliteDeLigne,
  voitVisibilite,
  type Champ,
  type ComptesCharge,
  type Lecteur,
  type Reprise,
  type Rubrique,
  type ValeurRessenti,
  type Visibilite,
  type VisibiliteLigne,
} from "@/lib/modeles";
import type { Acces } from "@/lib/acces";

export type Partie = "fait" | "en_cours" | "bloque" | "prochaine";
export const PARTIES: { id: Partie; libelle: string }[] = [
  { id: "fait", libelle: "Fait" },
  { id: "en_cours", libelle: "En cours" },
  { id: "bloque", libelle: "Bloqué" },
  { id: "prochaine", libelle: "La semaine prochaine" },
];

const TZ = process.env.APP_TZ || "America/Port-au-Prince";

export function semaineCourante() {
  return lundiDe(aujourdhui());
}

/** Le formulaire d'un rapport ; les rapports d'avant les modèles ont les quatre parties. */
export function formulaireDe(r: { formulaire: Champ[] | null }): Champ[] {
  return r.formulaire && r.formulaire.length ? r.formulaire : FORMULAIRE_PAR_DEFAUT;
}

/** Début et fin (exclue) de la semaine, en heure locale de la division. */
function bornes(semaine: string) {
  return {
    debut: sql`(${semaine}::date)::timestamp at time zone ${TZ}`,
    fin: sql`(${ajouterJours(semaine, 7)}::date)::timestamp at time zone ${TZ}`,
  };
}

type LignePrevue = { partie: Partie; texte: string; projetId: string | null; tacheId: string };

/** Brouillon par règles simples, sans IA : ce qui a été fait, en cours, bloqué, prévu. */
export async function brouillonParRegles(auteurId: string, semaine: string): Promise<LignePrevue[]> {
  const { debut, fin } = bornes(semaine);
  const taches = await db.select().from(schema.taches).where(and(eq(schema.taches.assigneId, auteurId), isNull(schema.taches.annuleeLe))).orderBy(asc(schema.taches.echeance));
  const notes = await db
    .select({ tacheId: schema.evenementsTache.tacheId, note: schema.evenementsTache.note })
    .from(schema.evenementsTache)
    .innerJoin(schema.taches, eq(schema.taches.id, schema.evenementsTache.tacheId))
    .where(and(eq(schema.taches.assigneId, auteurId), eq(schema.evenementsTache.type, "note"), sql`${schema.evenementsTache.creeLe} >= ${debut}`, sql`${schema.evenementsTache.creeLe} < ${fin}`))
    .orderBy(asc(schema.evenementsTache.creeLe));
  const derniereNote = new Map(notes.map((n) => [n.tacheId, n.note ?? ""]));

  const dimanche = ajouterJours(semaine, 6);
  const dansLaSemaine = (d: Date | null) => {
    if (!d) return false;
    const j = dateLocale(d);
    return j >= semaine && j <= dimanche;
  };
  const limite = ajouterJours(semaine, 13);
  const lignes: LignePrevue[] = [];
  for (const t of taches) {
    const base = { projetId: t.projetId, tacheId: t.id };
    if (t.statut === "faite" && dansLaSemaine(t.termineeLe)) lignes.push({ ...base, partie: "fait", texte: t.titre });
    if (t.statut === "en_cours") {
      const note = derniereNote.get(t.id);
      lignes.push({ ...base, partie: "en_cours", texte: note ? `${t.titre}, ${note.charAt(0).toLowerCase()}${note.slice(1)}` : t.titre });
    }
    if (t.statut === "bloquee") lignes.push({ ...base, partie: "bloque", texte: t.blocage ? `${t.titre} : ${t.blocage}` : t.titre });
  }
  const prevues = taches.filter((t) => (t.statut === "a_faire" || t.statut === "en_cours") && (!t.echeance || t.echeance <= limite)).slice(0, 5);
  for (const t of prevues) lignes.push({ partie: "prochaine", texte: t.titre, projetId: t.projetId, tacheId: t.id });
  return lignes;
}

/** Projets à noter (santé) : ceux de mes tâches ouvertes ou faites cette semaine, et ceux que je dirige. */
async function projetsANoter(auteurId: string, semaine: string) {
  const { debut } = bornes(semaine);
  const viaTaches = await db
    .selectDistinct({ id: schema.projets.id })
    .from(schema.taches)
    .innerJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(eq(schema.taches.assigneId, auteurId), or(ne(schema.taches.statut, "faite"), sql`${schema.taches.termineeLe} >= ${debut}`), isNull(schema.taches.annuleeLe)));
  const diriges = await db.select({ id: schema.projets.id }).from(schema.projets).where(eq(schema.projets.chefProjetId, auteurId));
  const ids = [...new Set([...viaTaches, ...diriges].map((x) => x.id))];
  if (!ids.length) return [];
  return db
    .select({ id: schema.projets.id, code: schema.projets.code, sante: schema.projets.sante, statut: schema.projets.statut })
    .from(schema.projets)
    .where(and(inArray(schema.projets.id, ids), ne(schema.projets.statut, "finalise")))
    .orderBy(asc(schema.projets.code));
}

/** Feux donnés dans mon dernier rapport envoyé, par projet. */
async function feuxPrecedents(auteurId: string, semaine: string) {
  const [r] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.statut, "envoye"), lt(schema.rapportsHebdo.semaine, semaine)))
    .orderBy(desc(schema.rapportsHebdo.semaine))
    .limit(1);
  if (!r) return new Map<string, string>();
  const champs = new Set(formulaireDe(r).filter((c) => c.type === "sante" && c.partie !== "equipe").map((c) => c.id));
  const rep = await db.select().from(schema.reponsesRapport).where(eq(schema.reponsesRapport.rapportId, r.id));
  return new Map(rep.filter((x) => champs.has(x.champId) && x.projetId && x.valeur).map((x) => [x.projetId!, x.valeur]));
}

/** Charge calculée d'une personne (semaine prochaine : la semaine que le rapport prépare). */
async function chargeCalculee(ids: string[]) {
  const { lignes } = await chargeDesPersonnes(ids, 2);
  return new Map(lignes.map((l) => [l.id, l.charge.semaines[1] ?? l.charge.semaines[0]]));
}

export async function obtenirOuCreerRapport(auteurId: string, semaine = semaineCourante()) {
  const [existant] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.semaine, semaine)))
    .limit(1);
  if (existant) return existant;
  const f = await formulairePour(auteurId);
  // Créé après l'heure « prêt à relire » : le brouillon part déjà des tâches de toute la semaine.
  const dejaPret = etapeRapport(f.modele?.horaires ?? HORAIRES_PAR_DEFAUT, semaine, maintenantLocal()) !== "en_preparation";
  const prevues = await brouillonParRegles(auteurId, semaine);
  const lignesDuChamp = (r: Rubrique) => f.champs.find((c) => c.type === "lignes" && c.prerempli && c.partie !== "equipe" && c.rubrique === r);
  const lignes = prevues.flatMap((l) => {
    const c = lignesDuChamp(l.partie);
    return c ? [{ ...l, champId: c.id, projetId: c.parProjet === false ? null : l.projetId }] : [];
  });
  const reponses: Omit<typeof schema.reponsesRapport.$inferInsert, "rapportId">[] = [];
  const sante = f.champs.filter((c) => c.type === "sante" && c.partie !== "equipe");
  if (sante.length) {
    const [projets, precedents] = await Promise.all([projetsANoter(auteurId, semaine), feuxPrecedents(auteurId, semaine)]);
    for (const c of sante) {
      for (const p of projets) {
        const propose = c.prerempli ? (precedents.get(p.id) ?? p.sante) : null;
        reponses.push({ champId: c.id, projetId: p.id, valeur: propose ?? "", propose, commentaire: "" });
      }
    }
  }
  const charge = f.champs.filter((c) => c.type === "charge" && c.partie !== "equipe");
  if (charge.length) {
    const calc = (await chargeCalculee([auteurId])).get(auteurId);
    for (const c of charge) {
      const propose = calc && c.prerempli ? ressentiPropose(calc.niveau) : null;
      reponses.push({ champId: c.id, valeur: propose ?? "", propose, commentaire: calc ? `${Math.round(calc.heures)} h sur ${calc.capacite} h` : "" });
    }
  }
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(schema.rapportsHebdo)
      .values({ auteurId, semaine, versionModeleId: f.versionId, formulaire: f.champs, completeLe: dejaPret ? new Date() : null })
      .onConflictDoNothing()
      .returning();
    if (!r) {
      const [deja] = await tx.select().from(schema.rapportsHebdo).where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.semaine, semaine)));
      return deja;
    }
    if (lignes.length) await tx.insert(schema.lignesRapport).values(lignes.map((l, i) => ({ ...l, rapportId: r.id, ordre: i + 1 })));
    if (reponses.length) await tx.insert(schema.reponsesRapport).values(reponses.map((x) => ({ ...x, rapportId: r.id })));
    return r;
  });
}

export async function lignesDuRapport(rapportId: string) {
  return db
    .select({
      id: schema.lignesRapport.id,
      champId: schema.lignesRapport.champId,
      partie: schema.lignesRapport.partie,
      texte: schema.lignesRapport.texte,
      ordre: schema.lignesRapport.ordre,
      projetId: schema.lignesRapport.projetId,
      tacheId: schema.lignesRapport.tacheId,
      origines: schema.lignesRapport.origines,
      auteursOrigine: schema.lignesRapport.auteursOrigine,
      visibilite: schema.lignesRapport.visibilite,
      remonte: schema.lignesRapport.remonte,
      retiree: schema.lignesRapport.retiree,
      projetCode: schema.projets.code,
      projetTitre: schema.projets.titre,
      projetChefId: schema.projets.chefProjetId,
    })
    .from(schema.lignesRapport)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.lignesRapport.projetId))
    .where(eq(schema.lignesRapport.rapportId, rapportId))
    .orderBy(asc(schema.lignesRapport.ordre));
}
export type LigneLue = Awaited<ReturnType<typeof lignesDuRapport>>[number];

export async function reponsesDuRapport(rapportId: string) {
  return db
    .select({
      id: schema.reponsesRapport.id,
      champId: schema.reponsesRapport.champId,
      projetId: schema.reponsesRapport.projetId,
      valeur: schema.reponsesRapport.valeur,
      commentaire: schema.reponsesRapport.commentaire,
      propose: schema.reponsesRapport.propose,
      proposeParIa: schema.reponsesRapport.proposeParIa,
      projetCode: schema.projets.code,
      projetTitre: schema.projets.titre,
      projetChefId: schema.projets.chefProjetId,
    })
    .from(schema.reponsesRapport)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.reponsesRapport.projetId))
    .where(eq(schema.reponsesRapport.rapportId, rapportId))
    .orderBy(asc(schema.projets.code));
}
export type ReponseLue = Awaited<ReturnType<typeof reponsesDuRapport>>[number];

const estPropre = (l: { origines: string[] }) => l.origines.length === 0;

/** Qui lira ce rapport : le supérieur en entier, la direction, chaque chef de projet sa partie. */
export async function lecteursDuRapport(auteurId: string, lignes: LigneLue[], formulaire: Champ[] = FORMULAIRE_PAR_DEFAUT) {
  const org = await chargerOrganisation();
  const sup = resoudreSuperieur(org, auteurId);
  // Directeurs au-dessus de l'auteur : ils voient le rapport (sa direction), sauf les champs réservés au supérieur.
  const directeurs = [...org.personnes.values()].filter(
    (p) => p.actif && p.directeur && !p.executif && p.id !== auteurId && p.id !== sup?.id && membresDeLaDirection(org, p.id).has(auteurId),
  );
  const voientTout = new Set([auteurId, sup?.id, ...directeurs.map((d) => d.id)]);
  const champs = new Map(formulaire.map((c) => [c.id, c]));
  const parChef = new Map<string, { code: string; titre: string; n: number }>();
  for (const l of lignes) {
    const c = champs.get(l.champId);
    if (!c || !estPropre(l) || (c.visibilite ?? "tous") !== "tous") continue;
    if (!l.projetChefId || voientTout.has(l.projetChefId) || org.personnes.get(l.projetChefId)?.executif) continue;
    const x = parChef.get(l.projetChefId) ?? { code: l.projetCode ?? "", titre: l.projetTitre ?? "", n: 0 };
    x.n += 1;
    parChef.set(l.projetChefId, x);
  }
  return {
    superieur: sup ? { id: sup.id, nom: nomComplet(sup), poste: sup.poste, prenom: sup.prenom } : null,
    directeurs: directeurs.map((d) => ({ id: d.id, nom: nomComplet(d), poste: d.poste })),
    chefs: [...parChef.entries()].map(([id, x]) => {
      const p = org.personnes.get(id)!;
      return { id, nom: nomComplet(p), prenom: p.prenom, ...x };
    }),
  };
}

// ---------------------------------------------------------------------------
// Rapport de chef : ce qui est repris des rapports reçus
// ---------------------------------------------------------------------------

/** Rapports envoyés au chef cette semaine-là (destinataire fixé à l'envoi). */
async function rapportsRecus(chefId: string, semaine: string) {
  return db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.destinataireId, chefId), eq(schema.rapportsHebdo.semaine, semaine), eq(schema.rapportsHebdo.statut, "envoye")))
    .orderBy(asc(schema.rapportsHebdo.envoyeLe));
}

type Element = { origine: string; texte: string; projetId: string | null; partie: string | null; visibilite: string | null; auteurs: string[] };

const RUBRIQUES_A_DECIDER = new Set(["bloque", "decision"]);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Ce qu'un rapport reçu apporte à une reprise donnée. */
function elementsDe(recu: typeof schema.rapportsHebdo.$inferSelect, lignes: LigneLue[], reponses: ReponseLue[], reprise: Reprise): Element[] {
  const f = formulaireDe(recu);
  const champs = new Map(f.map((c) => [c.id, c]));
  const prive = (c: Champ) => ((c.visibilite ?? "tous") === "superieur" ? "auteur" : (c.visibilite ?? "tous") === "direction" ? "direction" : null);
  const sortie: Element[] = [];
  for (const l of lignes) {
    const c = champs.get(l.champId);
    if (!c || l.retiree) continue;
    if (c.type === "lignes" && c.partie !== "equipe" && estPropre(l)) {
      const r = c.rubrique ?? "autre";
      const pour = reprise === "a_decider" ? RUBRIQUES_A_DECIDER.has(r) : r === reprise;
      if (!pour) continue;
      // Ce qui est réservé au supérieur ne remonte dans les listes que comme élément à décider.
      if (reprise !== "a_decider" && (c.visibilite ?? "tous") === "superieur") continue;
      sortie.push({ origine: `l:${l.id}`, texte: l.texte, projetId: l.projetId, partie: r, visibilite: prive(c), auteurs: [recu.auteurId] });
    } else if (c.type === "reprise" && c.reprise === reprise && !estPropre(l)) {
      // Rapport de chef reçu : ce qu'il a gardé (et, pour « à décider », seulement ce qu'il fait remonter).
      if (reprise === "a_decider" && !l.remonte) continue;
      sortie.push({ origine: `l:${l.id}`, texte: l.texte, projetId: l.projetId, partie: l.partie, visibilite: l.remonte ? null : l.visibilite, auteurs: l.auteursOrigine });
    }
  }
  if (reprise === "a_decider") {
    for (const x of reponses) {
      const c = champs.get(x.champId);
      if (!c || c.partie === "equipe" || (c.type !== "texte" && c.type !== "texte_long") || c.rubrique !== "decision" || !x.valeur.trim()) continue;
      sortie.push({ origine: `r:${x.id}`, texte: x.valeur.trim(), projetId: null, partie: "decision", visibilite: prive(c), auteurs: [recu.auteurId] });
    }
  }
  return sortie;
}

/**
 * Brouillon d'un rapport de chef : ajoute les éléments des rapports reçus depuis la dernière fois
 * (à décider, fait, en cours, prévu). Les signalements identiques sur un même projet sont fusionnés.
 * Rien n'est retiré : ce que le chef a retiré reste retiré.
 */
export async function synchroniserReprises(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  if (rapport.statut !== "brouillon") return 0;
  const f = formulaireDe(rapport);
  const champs = f.filter((c) => c.type === "reprise" && c.reprise && c.reprise !== "sante" && c.reprise !== "charge");
  if (!champs.length) return 0;
  const recus = await rapportsRecus(rapport.auteurId, rapport.semaine);
  if (!recus.length) return 0;
  const existantes = await lignesDuRapport(rapport.id);
  const vues = new Set(existantes.flatMap((l) => l.origines));
  let ordre = existantes.reduce((m, l) => Math.max(m, l.ordre), 0);
  let ajoutees = 0;
  for (const recu of recus) {
    const [lignes, reponses] = await Promise.all([lignesDuRapport(recu.id), reponsesDuRapport(recu.id)]);
    for (const c of champs) {
      for (const e of elementsDe(recu, lignes, reponses, c.reprise!)) {
        if (vues.has(e.origine)) continue;
        vues.add(e.origine);
        const jumelle = existantes.find((l) => l.champId === c.id && l.projetId === e.projetId && norm(l.texte) === norm(e.texte));
        if (jumelle) {
          jumelle.origines = [...jumelle.origines, e.origine];
          jumelle.auteursOrigine = [...new Set([...jumelle.auteursOrigine, ...e.auteurs])];
          await db.update(schema.lignesRapport).set({ origines: jumelle.origines, auteursOrigine: jumelle.auteursOrigine }).where(eq(schema.lignesRapport.id, jumelle.id));
          continue;
        }
        ordre += 1;
        const [n] = await db
          .insert(schema.lignesRapport)
          .values({ rapportId: rapport.id, champId: c.id, partie: e.partie, texte: e.texte, projetId: e.projetId, ordre, origines: [e.origine], auteursOrigine: e.auteurs, visibilite: e.visibilite })
          .returning();
        existantes.push({ ...n, projetCode: null, projetTitre: null, projetChefId: null });
        ajoutees += 1;
      }
    }
  }
  return ajoutees;
}

export type AvisSante = { projetId: string; code: string; titre: string; propose: string | null; choisi: string | null; avis: { qui: string; valeur: string }[] };
export type ChargeMembre = { id: string; nom: string; initiales: string; ressenti: string | null; niveau: string; heures: number; capacite: number; envoye: boolean };

/** Ce que le chef voit des feux et de la charge de son équipe, tant que son rapport est un brouillon. */
export async function vueEquipe(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  const f = formulaireDe(rapport);
  const org = await chargerOrganisation();
  const recus = await rapportsRecus(rapport.auteurId, rapport.semaine);
  const contenu = await Promise.all(recus.map(async (r) => ({ r, lignes: await lignesDuRapport(r.id), reponses: await reponsesDuRapport(r.id) })));
  const miennes = await reponsesDuRapport(rapport.id);
  const ini = (id: string) => (org.personnes.get(id) ? initiales(org.personnes.get(id)!) : "?");

  // Santé : les feux de chaque rapport reçu (et les miens), le plus préoccupant est proposé.
  const parProjet = new Map<string, { code: string; titre: string; avis: { qui: string; valeur: string }[] }>();
  const noter = (projetId: string | null, code: string | null, titre: string | null, qui: string, valeur: string) => {
    if (!projetId || !valeur) return;
    const p = parProjet.get(projetId) ?? { code: code ?? "", titre: titre ?? "", avis: [] };
    p.avis.push({ qui, valeur });
    parProjet.set(projetId, p);
  };
  for (const x of miennes) {
    const c = f.find((k) => k.id === x.champId);
    if (c?.type === "sante" && c.partie !== "equipe") noter(x.projetId, x.projetCode, x.projetTitre, ini(rapport.auteurId), x.valeur);
  }
  for (const { r, reponses } of contenu) {
    const fr = formulaireDe(r);
    // Un rapport de chef donne déjà, par projet, le feu qu'il a retenu pour lui et son équipe.
    const deChef = fr.some((k) => k.type === "reprise" && k.reprise === "sante");
    for (const x of reponses) {
      const c = fr.find((k) => k.id === x.champId);
      if (!deChef && c?.type === "sante" && c.partie !== "equipe") noter(x.projetId, x.projetCode, x.projetTitre, ini(r.auteurId), x.valeur);
      if (c?.type === "reprise" && c.reprise === "sante") noter(x.projetId, x.projetCode, x.projetTitre, `${ini(r.auteurId)} et équipe`, x.valeur);
    }
  }
  const sante = new Map<string, AvisSante[]>();
  for (const c of f.filter((k) => k.type === "reprise" && k.reprise === "sante")) {
    const choix = new Map(miennes.filter((x) => x.champId === c.id && x.projetId).map((x) => [x.projetId!, x.valeur]));
    sante.set(
      c.id,
      [...parProjet.entries()]
        .map(([projetId, p]) => ({ projetId, code: p.code, titre: p.titre, propose: pireSante(p.avis.map((a) => a.valeur)), choisi: choix.get(projetId) || null, avis: p.avis }))
        .sort((a, b) => a.code.localeCompare(b.code, "fr")),
    );
  }

  // Charge : chaque personne qui m'envoie son rapport (ressenti déclaré, niveau calculé) ; les équipes en nombres.
  const subordonnes = subordonnesDirects(org, rapport.auteurId);
  const calc = await chargeCalculee(subordonnes.map((p) => p.id));
  const membres: ChargeMembre[] = subordonnes.map((p) => {
    const recu = contenu.find((x) => x.r.auteurId === p.id);
    let ressenti: string | null = null;
    if (recu) {
      const fr = formulaireDe(recu.r);
      ressenti = recu.reponses.find((x) => fr.find((k) => k.id === x.champId)?.type === "charge" && fr.find((k) => k.id === x.champId)?.partie !== "equipe")?.valeur || null;
    }
    const s = calc.get(p.id);
    return { id: p.id, nom: nomComplet(p), initiales: initiales(p), ressenti, niveau: s?.niveau ?? "libre", heures: s?.heures ?? 0, capacite: s?.capacite ?? 0, envoye: !!recu };
  });
  const equipes: { qui: string; comptes: ComptesCharge }[] = [];
  for (const { r, reponses } of contenu) {
    const fr = formulaireDe(r);
    for (const x of reponses) {
      const c = fr.find((k) => k.id === x.champId);
      const comptes = c?.type === "reprise" && c.reprise === "charge" ? lireComptes(x.valeur) : null;
      if (comptes) equipes.push({ qui: org.personnes.get(r.auteurId) ? nomComplet(org.personnes.get(r.auteurId)!) : "", comptes });
    }
  }
  const comptes = [comptesDesMembres(membres), ...equipes.map((e) => e.comptes)].reduce(additionnerComptes, comptesVides());
  return { recus: recus.map((r) => ({ id: r.id, auteurId: r.auteurId, envoyeLe: r.envoyeLe })), subordonnes: subordonnes.map((p) => ({ id: p.id, nom: nomComplet(p), initiales: initiales(p) })), sante, charge: { membres, equipes, comptes } };
}

function comptesDesMembres(membres: ChargeMembre[]): ComptesCharge {
  const c = comptesVides();
  for (const m of membres) {
    c.calcule[m.niveau as keyof ComptesCharge["calcule"]] += 1;
    c.ressenti[(m.ressenti as ValeurRessenti) || "aucun"] += 1;
  }
  return c;
}

/** À l'envoi d'un rapport de chef : feux et charge de l'équipe sont figés tels qu'il les a vus. */
async function figerEquipe(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  const f = formulaireDe(rapport);
  if (!f.some((c) => c.type === "reprise" && (c.reprise === "sante" || c.reprise === "charge"))) return;
  const v = await vueEquipe(rapport);
  await db.transaction(async (tx) => {
    for (const c of f.filter((k) => k.type === "reprise" && k.reprise === "sante")) {
      await tx.delete(schema.reponsesRapport).where(and(eq(schema.reponsesRapport.rapportId, rapport.id), eq(schema.reponsesRapport.champId, c.id)));
      const lignes = (v.sante.get(c.id) ?? []).filter((p) => p.choisi || p.propose);
      if (lignes.length)
        await tx.insert(schema.reponsesRapport).values(
          lignes.map((p) => ({
            rapportId: rapport.id,
            champId: c.id,
            projetId: p.projetId,
            valeur: p.choisi || p.propose || "",
            propose: p.propose,
            commentaire: p.avis.map((a) => `${a.qui} : ${libelleSante(a.valeur).toLowerCase()}`).join(" · "),
          })),
        );
    }
    for (const c of f.filter((k) => k.type === "reprise" && k.reprise === "charge")) {
      await tx.delete(schema.reponsesRapport).where(and(eq(schema.reponsesRapport.rapportId, rapport.id), eq(schema.reponsesRapport.champId, c.id)));
      await tx.insert(schema.reponsesRapport).values({ rapportId: rapport.id, champId: c.id, valeur: JSON.stringify(v.charge.comptes), commentaire: `${v.charge.membres.length} personne(s) ; ${v.charge.equipes.map((e) => e.qui).join(", ")}` });
    }
  });
}

/** Champ « reunions » : la liste de la semaine est figée à l'envoi (le journal peut changer ensuite). */
async function figerReunions(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  const champs = formulaireDe(rapport).filter((c) => c.type === "reunions");
  if (!champs.length) return;
  const v = await reunionsDeLaSemaine(rapport.auteurId, rapport.semaine);
  for (const c of champs) {
    await db.delete(schema.reponsesRapport).where(and(eq(schema.reponsesRapport.rapportId, rapport.id), eq(schema.reponsesRapport.champId, c.id)));
    await db.insert(schema.reponsesRapport).values({ rapportId: rapport.id, champId: c.id, valeur: JSON.stringify(v), commentaire: `${v.reunions.length} réunion(s)` });
  }
}

/** Ce qu'il faut pour vérifier les champs obligatoires. */
async function remplissage(rapportId: string, f: Champ[]) {
  const [lignes, reponses, pieces] = await Promise.all([
    lignesDuRapport(rapportId),
    reponsesDuRapport(rapportId),
    db.select({ champId: schema.piecesJointes.champId }).from(schema.piecesJointes).where(eq(schema.piecesJointes.rapportId, rapportId)),
  ]);
  const nPieces = new Map<string, number>();
  for (const x of pieces) nPieces.set(x.champId, (nPieces.get(x.champId) ?? 0) + 1);
  const nLignes = new Map<string, number>();
  for (const l of lignes) if (!l.retiree) nLignes.set(l.champId, (nLignes.get(l.champId) ?? 0) + 1);
  const rep = new Map<string, string[]>();
  const projets = new Map<string, number>();
  for (const x of reponses) {
    rep.set(x.champId, [...(rep.get(x.champId) ?? []), x.valeur]);
    if (x.projetId) projets.set(x.champId, (projets.get(x.champId) ?? 0) + 1);
  }
  return champsManquants(f, { lignes: nLignes, reponses: rep, projetsANoter: projets, pieces: nPieces });
}

export async function manquantsDuRapport(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  return remplissage(rapport.id, formulaireDe(rapport));
}

export async function envoyerRapport(rapportId: string, auteurId: string): Promise<{ ok: true } | { ok: false; manquants: string[] } | null> {
  const [brouillon] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.id, rapportId), eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.statut, "brouillon")));
  if (!brouillon) return null;
  const f = formulaireDe(brouillon);
  const manquants = await remplissage(rapportId, f);
  if (manquants.length) return { ok: false, manquants: manquants.map((c) => c.libelle) };
  await synchroniserReprises(brouillon);
  await synchroniserSyntheses(brouillon);
  await figerEquipe(brouillon);
  await figerReunions(brouillon);
  const org = await chargerOrganisation();
  const sup = resoudreSuperieur(org, auteurId);
  const [r] = await db
    .update(schema.rapportsHebdo)
    .set({ statut: "envoye", destinataireId: sup?.id ?? null, envoyeLe: new Date(), majLe: new Date() })
    .where(and(eq(schema.rapportsHebdo.id, rapportId), eq(schema.rapportsHebdo.statut, "brouillon")))
    .returning();
  if (!r) return null;
  const auteur = org.personnes.get(auteurId)!;
  const lignes = await lignesDuRapport(rapportId);
  const notifs: (typeof schema.notifications.$inferInsert)[] = [];
  if (sup) notifs.push({ personneId: sup.id, type: "rapport_recu", texte: `Rapport de la semaine de ${nomComplet(auteur)}`, lien: `/rapports/${rapportId}` });
  const { chefs } = await lecteursDuRapport(auteurId, lignes, f);
  for (const c of chefs) {
    notifs.push({ personneId: c.id, type: "rapport_recu", texte: `${nomComplet(auteur)} : ${c.n} ligne${c.n > 1 ? "s" : ""} sur ${c.titre}`, lien: `/rapports/${rapportId}` });
  }
  if (notifs.length) await db.insert(schema.notifications).values(notifs);
  await noter(auteurId, "rapport_envoye", rapportId, { destinataire: sup?.id ?? null, chefs: chefs.map((c) => c.id) });
  return { ok: true };
}

/** Quelle place a cette personne devant ce rapport (null : aucune). */
function lecteurDe(org: Awaited<ReturnType<typeof chargerOrganisation>>, a: Acces, r: typeof schema.rapportsHebdo.$inferSelect): Lecteur | null {
  if (r.auteurId === a.moi.id) return "auteur";
  if (r.statut !== "envoye") return null;
  if (r.destinataireId === a.moi.id || estSuperieurDe(org, a.moi.id, r.auteurId)) return "superieur";
  if (voitTout(a.moi) || (a.moi.directeur && membresDeLaDirection(org, a.moi.id).has(r.auteurId))) return "direction";
  return null;
}

/**
 * Lecture d'un rapport, filtrée champ par champ : le supérieur voit tout ; la direction tout sauf
 * les champs réservés au supérieur ; un chef de projet, les seules lignes et feux de ses projets.
 */
export async function lireRapport(a: Acces, rapportId: string) {
  const [r] = await db.select().from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.id, rapportId)).limit(1);
  if (!r) return null;
  const org = await chargerOrganisation();
  const [lignes, reponses, version] = await Promise.all([lignesDuRapport(r.id), reponsesDuRapport(r.id), versionDuRapport(r.versionModeleId)]);
  const f = formulaireDe(r);
  let lecteur = lecteurDe(org, a, r);
  if (!lecteur && r.statut === "envoye" && lignes.some((l) => l.projetChefId === a.moi.id)) lecteur = "chef_projet";
  if (!lecteur) return null;
  const champs = new Map(f.map((c) => [c.id, c]));
  const champVisible = (c: Champ) => (estDecoratif(c) ? lecteur !== "chef_projet" : voitVisibilite(lecteur!, c.visibilite ?? "tous"));
  const lignesVisibles = lignes.filter((l) => {
    const c = champs.get(l.champId);
    if (!c || !champVisible(c)) return false;
    if (l.retiree && lecteur !== "auteur") return false;
    if (!voitVisibilite(lecteur!, visibiliteDeLigne(c, l))) return false;
    if (lecteur === "chef_projet") return estPropre(l) && l.projetChefId === a.moi.id;
    return true;
  });
  const reponsesVisibles = reponses.filter((x) => {
    const c = champs.get(x.champId);
    if (!c || !champVisible(c)) return false;
    if (lecteur === "chef_projet") return c.type === "sante" && c.partie !== "equipe" && x.projetChefId === a.moi.id;
    return true;
  });
  if (lecteur === "chef_projet" && !lignesVisibles.length && !reponsesVisibles.length) return null;
  const formulaire = f.filter((c) => champVisible(c) && (lecteur !== "chef_projet" || lignesVisibles.some((l) => l.champId === c.id) || reponsesVisibles.some((x) => x.champId === c.id)));
  return {
    rapport: r,
    formulaire,
    lignes: lignesVisibles,
    reponses: reponsesVisibles,
    lecteur,
    complet: lecteur !== "chef_projet",
    /** Champs cachés à ce lecteur (pour le dire, sans montrer le contenu). */
    caches: f.filter((c) => !estDecoratif(c) && !champVisible(c)).map((c) => c.libelle),
    version,
    auteur: org.personnes.get(r.auteurId)!,
  };
}

/** Lignes envoyées cette semaine sur un projet, regroupées par auteur (fiche projet). Seuls les champs ouverts à tous. */
export async function lignesDuProjetCetteSemaine(projetId: string, auteurs: "toutes" | Set<string>, semaine = semaineCourante()) {
  const lignes = await db
    .select({
      auteurId: schema.rapportsHebdo.auteurId,
      envoyeLe: schema.rapportsHebdo.envoyeLe,
      formulaire: schema.rapportsHebdo.formulaire,
      champId: schema.lignesRapport.champId,
      partie: schema.lignesRapport.partie,
      texte: schema.lignesRapport.texte,
      ordre: schema.lignesRapport.ordre,
      origines: schema.lignesRapport.origines,
    })
    .from(schema.lignesRapport)
    .innerJoin(schema.rapportsHebdo, eq(schema.rapportsHebdo.id, schema.lignesRapport.rapportId))
    .where(and(eq(schema.lignesRapport.projetId, projetId), eq(schema.rapportsHebdo.semaine, semaine), eq(schema.rapportsHebdo.statut, "envoye")))
    .orderBy(asc(schema.rapportsHebdo.envoyeLe), asc(schema.lignesRapport.ordre));
  const org = await chargerOrganisation();
  const parAuteur = new Map<string, { auteurId: string; auteur: string; prenom: string; nom: string; envoyeLe: Date | null; lignes: { partie: string | null; champ: string; texte: string }[] }>();
  for (const l of lignes) {
    if (auteurs !== "toutes" && !auteurs.has(l.auteurId)) continue;
    if (l.origines.length) continue; // les reprises d'un rapport de chef répètent les rapports de l'équipe
    const c = formulaireDe({ formulaire: l.formulaire }).find((x) => x.id === l.champId);
    if (!c || c.type !== "lignes" || (c.visibilite ?? "tous") !== "tous") continue;
    const p = org.personnes.get(l.auteurId)!;
    const g = parAuteur.get(l.auteurId) ?? { auteurId: l.auteurId, auteur: nomComplet(p), prenom: p.prenom, nom: p.nom, envoyeLe: l.envoyeLe, lignes: [] };
    g.lignes.push({ partie: l.partie, champ: c.libelle, texte: l.texte });
    parAuteur.set(l.auteurId, g);
  }
  return [...parAuteur.values()];
}

/** Statut des rapports de la semaine pour une liste de personnes. */
export async function statutsRapports(personneIds: string[], semaine = semaineCourante()) {
  if (!personneIds.length) return new Map<string, { id: string; statut: "brouillon" | "envoye"; envoyeLe: Date | null }>();
  const lignes = await db
    .select({ id: schema.rapportsHebdo.id, auteurId: schema.rapportsHebdo.auteurId, statut: schema.rapportsHebdo.statut, envoyeLe: schema.rapportsHebdo.envoyeLe })
    .from(schema.rapportsHebdo)
    .where(and(inArray(schema.rapportsHebdo.auteurId, personneIds), eq(schema.rapportsHebdo.semaine, semaine)));
  return new Map(lignes.map((l) => [l.auteurId, l]));
}

// ---------------------------------------------------------------------------
// Historique des rapports
// ---------------------------------------------------------------------------

export type ResumeRapport = {
  id: string;
  auteurId: string;
  semaine: string;
  statut: "brouillon" | "envoye";
  envoyeLe: Date | null;
  destinataireId: string | null;
  comptes: Record<Partie, number>;
  /** Les premières lignes « Fait », pour reconnaître la semaine d'un coup d'œil. */
  apercu: string[];
};

async function resumes(rapports: (typeof schema.rapportsHebdo.$inferSelect)[]): Promise<ResumeRapport[]> {
  if (!rapports.length) return [];
  const lignes = await db
    .select({ rapportId: schema.lignesRapport.rapportId, partie: schema.lignesRapport.partie, texte: schema.lignesRapport.texte, ordre: schema.lignesRapport.ordre, origines: schema.lignesRapport.origines })
    .from(schema.lignesRapport)
    .where(inArray(schema.lignesRapport.rapportId, rapports.map((r) => r.id)))
    .orderBy(asc(schema.lignesRapport.ordre));
  return rapports.map((r) => {
    // Ses propres lignes seulement : les reprises d'un rapport de chef sont comptées chez leurs auteurs.
    const siennes = lignes.filter((l) => l.rapportId === r.id && l.origines.length === 0);
    const comptes = { fait: 0, en_cours: 0, bloque: 0, prochaine: 0 } as Record<Partie, number>;
    for (const l of siennes) if (l.partie && l.partie in comptes) comptes[l.partie as Partie] += 1;
    return {
      id: r.id,
      auteurId: r.auteurId,
      semaine: r.semaine,
      statut: r.statut,
      envoyeLe: r.envoyeLe,
      destinataireId: r.destinataireId,
      comptes,
      apercu: siennes.filter((l) => l.partie === "fait").slice(0, 2).map((l) => l.texte),
    };
  });
}

/** Tous mes rapports, du plus récent au plus ancien (le brouillon de la semaine compris). */
export async function mesRapports(auteurId: string) {
  const r = await db.select().from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.auteurId, auteurId)).orderBy(desc(schema.rapportsHebdo.semaine));
  return resumes(r);
}

/** Semaines d'affilée avec un rapport envoyé, en remontant depuis la semaine dernière (ou celle-ci si déjà envoyé). */
export function serieDeRapports(liste: ResumeRapport[], semaine = semaineCourante()): number {
  const envoyees = new Set(liste.filter((r) => r.statut === "envoye").map((r) => r.semaine));
  let s = envoyees.has(semaine) ? semaine : ajouterJours(semaine, -7);
  let n = 0;
  while (envoyees.has(s)) {
    n += 1;
    s = ajouterJours(s, -7);
  }
  return n;
}

/**
 * Personnes dont je peux lire les rapports en entier, en plus des miens : celles que je suis
 * (supérieur direct, directeur, exécutif), et les auteurs des rapports qui m'ont été envoyés.
 */
export async function auteursDontJeLisLesRapports(a: Acces): Promise<string[]> {
  const org = await chargerOrganisation();
  const suivis = a.suivis === "toutes" ? [...org.personnes.keys()] : [...a.suivis];
  const recus = await db.selectDistinct({ id: schema.rapportsHebdo.auteurId }).from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.destinataireId, a.moi.id));
  return [...new Set([...suivis, ...recus.map((x) => x.id)])].filter((id) => id !== a.moi.id && org.personnes.has(id));
}

/** Rapports d'une semaine pour les personnes dont je lis les rapports (y compris celles qui n'ont rien envoyé). */
export async function rapportsDeLEquipe(a: Acces, semaine: string) {
  const org = await chargerOrganisation();
  const ids = (await auteursDontJeLisLesRapports(a)).filter((id) => org.personnes.get(id)?.actif);
  const rapports = ids.length
    ? await db
        .select()
        .from(schema.rapportsHebdo)
        .where(and(inArray(schema.rapportsHebdo.auteurId, ids), eq(schema.rapportsHebdo.semaine, semaine)))
    : [];
  const visibles = rapports.filter((r) => r.statut === "envoye" && peutVoirRapportComplet(org, a.moi, r));
  const parAuteur = new Map((await resumes(visibles)).map((r) => [r.auteurId, r]));
  return ids
    .map((id) => {
      const p = org.personnes.get(id)!;
      return {
        id,
        nom: nomComplet(p),
        prenom: p.prenom,
        initiales: initiales(p),
        poste: p.poste,
        equipe: p.equipeId ? (org.equipes.get(p.equipeId)?.nom ?? "") : "Sans équipe",
        rapport: parAuteur.get(id) ?? null,
      };
    })
    .sort((x, y) => x.equipe.localeCompare(y.equipe, "fr") || Number(!!x.rapport) - Number(!!y.rapport) || x.nom.localeCompare(y.nom, "fr"));
}

/** Historique des rapports envoyés par une personne, filtré par les règles de lecture. */
export async function historiqueDe(a: Acces, personneId: string) {
  const org = await chargerOrganisation();
  const rapports = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, personneId), eq(schema.rapportsHebdo.statut, "envoye")))
    .orderBy(desc(schema.rapportsHebdo.semaine));
  return resumes(rapports.filter((r) => peutVoirRapportComplet(org, a.moi, r)));
}

/** Rapports précédent et suivant du même auteur, parmi ceux que je peux lire en entier. */
export async function rapportsVoisins(a: Acces, rapport: { id: string; auteurId: string; semaine: string }) {
  const org = await chargerOrganisation();
  const tous = await db.select().from(schema.rapportsHebdo).where(eq(schema.rapportsHebdo.auteurId, rapport.auteurId)).orderBy(asc(schema.rapportsHebdo.semaine));
  const lisibles = tous.filter((r) => peutVoirRapportComplet(org, a.moi, r));
  const i = lisibles.findIndex((r) => r.id === rapport.id);
  return { precedent: i > 0 ? lisibles[i - 1] : null, suivant: i >= 0 && i < lisibles.length - 1 ? lisibles[i + 1] : null };
}

/** Mon dernier rapport envoyé avant cette semaine, avec mes propres lignes (pour reprendre ce qui était prévu). */
export async function monRapportPrecedent(auteurId: string, semaine = semaineCourante()) {
  const [r] = await db
    .select()
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, auteurId), eq(schema.rapportsHebdo.statut, "envoye"), lt(schema.rapportsHebdo.semaine, semaine)))
    .orderBy(desc(schema.rapportsHebdo.semaine))
    .limit(1);
  if (!r) return null;
  const lignes = await db
    .select({
      id: schema.lignesRapport.id,
      partie: schema.lignesRapport.partie,
      texte: schema.lignesRapport.texte,
      tacheId: schema.lignesRapport.tacheId,
      projetId: schema.lignesRapport.projetId,
      projetCode: schema.projets.code,
      origines: schema.lignesRapport.origines,
    })
    .from(schema.lignesRapport)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.lignesRapport.projetId))
    .where(eq(schema.lignesRapport.rapportId, r.id))
    .orderBy(asc(schema.lignesRapport.ordre));
  return { rapport: r, lignes: lignes.filter((l) => l.origines.length === 0) };
}

/** Une ligne prévue la semaine dernière est-elle déjà dans le rapport de cette semaine ? (même tâche, ou même texte) */
export function dejaReprise(prevue: { texte: string; tacheId: string | null }, actuelles: { texte: string; tacheId?: string | null; partie: string | null }[]): string | null {
  const t = norm(prevue.texte);
  const trouvee = actuelles.find((l) => (prevue.tacheId && l.tacheId === prevue.tacheId) || norm(l.texte) === t || (t.length > 12 && norm(l.texte).startsWith(t)));
  return trouvee ? (trouvee.partie ?? "autre") : null;
}

/** Le champ de lignes qui reçoit une rubrique (mon travail, pas la partie équipe). */
export function champDeRubrique(f: Champ[], r: Rubrique): Champ | undefined {
  return f.find((c) => c.type === "lignes" && c.partie !== "equipe" && c.rubrique === r);
}

/** Prochain numéro d'ordre dans un rapport. */
export async function ordreSuivant(rapportId: string) {
  const [{ m }] = await db.select({ m: max(schema.lignesRapport.ordre) }).from(schema.lignesRapport).where(eq(schema.lignesRapport.rapportId, rapportId));
  return (m ?? 0) + 1;
}

export { libelleRessenti };

// ---------------------------------------------------------------------------
// « Prêt à relire » : le brouillon complété avec les tâches de la semaine
// ---------------------------------------------------------------------------

const RUBRIQUES_DE_STATUT = new Set(["fait", "en_cours", "bloque"]);

/**
 * Complète un brouillon avec ce que les tâches disent maintenant : une tâche terminée depuis passe
 * dans « Fait » (la ligne existante est déplacée, son texte gardé), une nouvelle tâche s'ajoute, un
 * nouveau projet reçoit son feu. Ce que la personne a retiré ne revient pas. Rien n'est supprimé.
 */
export async function completerBrouillon(rapport: typeof schema.rapportsHebdo.$inferSelect): Promise<number> {
  if (rapport.statut !== "brouillon") return 0;
  const f = formulaireDe(rapport);
  const prevues = await brouillonParRegles(rapport.auteurId, rapport.semaine);
  const lignes = (await lignesDuRapport(rapport.id)).filter((l) => l.origines.length === 0);
  const ecartees = new Set(rapport.ecartees);
  const champDe = (r: Rubrique) => f.find((c) => c.type === "lignes" && c.prerempli && c.partie !== "equipe" && c.rubrique === r);
  let ordre = lignes.reduce((m, l) => Math.max(m, l.ordre), 0);
  let changes = 0;
  for (const p of prevues) {
    const c = champDe(p.partie);
    if (!c || ecartees.has(`${p.tacheId}:${p.partie}`)) continue;
    const memeTache = lignes.filter((l) => l.tacheId === p.tacheId);
    if (memeTache.some((l) => l.champId === c.id)) continue;
    // La tâche a changé d'état : sa ligne la suit (en cours → fait, en cours → bloqué…).
    const aDeplacer = RUBRIQUES_DE_STATUT.has(p.partie) ? memeTache.find((l) => l.partie && RUBRIQUES_DE_STATUT.has(l.partie)) : undefined;
    if (aDeplacer) {
      await db.update(schema.lignesRapport).set({ champId: c.id, partie: p.partie }).where(eq(schema.lignesRapport.id, aDeplacer.id));
      aDeplacer.champId = c.id;
      aDeplacer.partie = p.partie;
    } else {
      ordre += 1;
      const [n] = await db
        .insert(schema.lignesRapport)
        .values({ rapportId: rapport.id, champId: c.id, partie: p.partie, texte: p.texte, projetId: c.parProjet === false ? null : p.projetId, tacheId: p.tacheId, ordre })
        .returning();
      lignes.push({ ...n, projetCode: null, projetTitre: null, projetChefId: null });
    }
    changes += 1;
  }
  const sante = f.filter((c) => c.type === "sante" && c.partie !== "equipe");
  if (sante.length) {
    const [projets, precedents, reponses] = await Promise.all([projetsANoter(rapport.auteurId, rapport.semaine), feuxPrecedents(rapport.auteurId, rapport.semaine), reponsesDuRapport(rapport.id)]);
    for (const c of sante) {
      for (const p of projets) {
        if (reponses.some((x) => x.champId === c.id && x.projetId === p.id)) continue;
        const propose = c.prerempli ? (precedents.get(p.id) ?? p.sante) : null;
        await db.insert(schema.reponsesRapport).values({ rapportId: rapport.id, champId: c.id, projetId: p.id, valeur: propose ?? "", propose, commentaire: "" }).onConflictDoNothing();
        changes += 1;
      }
    }
  }
  await db.update(schema.rapportsHebdo).set({ completeLe: new Date(), majLe: new Date() }).where(eq(schema.rapportsHebdo.id, rapport.id));
  return changes;
}

/** Où en est la semaine de ce rapport (prêt à relire, rappel, en retard) et ses heures. */
export async function calendrierDuRapport(rapport: { versionModeleId: string | null; semaine: string }) {
  const horaires = await horairesDuRapport(rapport);
  return { horaires, etape: etapeRapport(horaires, rapport.semaine, maintenantLocal()) };
}

// ---------------------------------------------------------------------------
// Synthèse par projet (rapport de chef)
// ---------------------------------------------------------------------------

const RANG_VISIBILITE: Record<VisibiliteLigne, number> = { tous: 0, direction: 1, superieur: 2, auteur: 3 };
/** Un élément peut nourrir un champ si ceux qui lisent le champ pouvaient déjà le lire. */
const compatible = (source: VisibiliteLigne, cible: Visibilite) => RANG_VISIBILITE[source] <= RANG_VISIBILITE[cible];

export type MatiereSynthese = { projetId: string; code: string; titre: string; elements: (ElementSynthese & { qui: string })[]; recues: { qui: string; texte: string }[] };

/**
 * Ce que l'équipe a envoyé, par projet, pour la synthèse d'un rapport de chef : lignes reçues (fait,
 * en cours, à décider, ensuite), synthèses des chefs d'équipe, et ses propres lignes. Seul ce que les
 * lecteurs du champ pouvaient déjà lire y entre : un élément réservé au chef n'en fait pas partie.
 */
export async function matierePourSynthese(rapport: typeof schema.rapportsHebdo.$inferSelect, champ: Champ): Promise<MatiereSynthese[]> {
  const cible = champ.visibilite ?? "tous";
  const org = await chargerOrganisation();
  const recus = await rapportsRecus(rapport.auteurId, rapport.semaine);
  const parProjet = new Map<string, { elements: (ElementSynthese & { qui: string })[]; recues: { qui: string; texte: string }[] }>();
  const groupe = (id: string) => {
    const g = parProjet.get(id) ?? { elements: [], recues: [] };
    parProjet.set(id, g);
    return g;
  };
  const prenom = (id: string) => org.personnes.get(id)?.prenom ?? "";
  for (const recu of recus) {
    const [lignes, reponses] = await Promise.all([lignesDuRapport(recu.id), reponsesDuRapport(recu.id)]);
    for (const reprise of ["fait", "en_cours", "a_decider", "prochaine"] as Reprise[]) {
      for (const e of elementsDe(recu, lignes, reponses, reprise)) {
        if (!e.projetId || !compatible((e.visibilite as VisibiliteLigne | null) ?? "tous", cible)) continue;
        groupe(e.projetId).elements.push({ rubrique: reprise === "a_decider" ? "bloque" : (e.partie ?? reprise), texte: e.texte, qui: e.auteurs.map(prenom).filter(Boolean).join(", ") });
      }
    }
    const fr = formulaireDe(recu);
    for (const x of reponses) {
      const c = fr.find((k) => k.id === x.champId);
      if (c?.type === "synthese" && x.projetId && x.valeur.trim() && compatible(c.visibilite ?? "tous", cible)) groupe(x.projetId).recues.push({ qui: prenom(recu.auteurId), texte: x.valeur.trim() });
    }
  }
  const f = formulaireDe(rapport);
  for (const l of await lignesDuRapport(rapport.id)) {
    if (l.origines.length || !l.projetId || l.retiree) continue;
    const c = f.find((k) => k.id === l.champId);
    if (!c || c.type !== "lignes" || c.partie === "equipe" || !compatible(c.visibilite ?? "tous", cible)) continue;
    groupe(l.projetId).elements.push({ rubrique: c.rubrique ?? l.partie, texte: l.texte, qui: prenom(rapport.auteurId) });
  }
  if (!parProjet.size) return [];
  const projets = await db.select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre }).from(schema.projets).where(inArray(schema.projets.id, [...parProjet.keys()]));
  return projets
    .map((p) => ({ projetId: p.id, code: p.code, titre: p.titre, ...parProjet.get(p.id)! }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr"));
}

/**
 * Prépare la synthèse de chaque projet. Une synthèse que le chef n'a pas touchée suit les rapports
 * qui arrivent ; une synthèse qu'il a écrite ou fait rédiger reste la sienne.
 */
export async function synchroniserSyntheses(rapport: typeof schema.rapportsHebdo.$inferSelect) {
  if (rapport.statut !== "brouillon") return new Map<string, MatiereSynthese[]>();
  const champs = formulaireDe(rapport).filter((c) => c.type === "synthese");
  const sortie = new Map<string, MatiereSynthese[]>();
  if (!champs.length) return sortie;
  const reponses = await reponsesDuRapport(rapport.id);
  for (const c of champs) {
    const matiere = await matierePourSynthese(rapport, c);
    sortie.set(c.id, matiere);
    for (const m of matiere) {
      const propose = syntheseParRegles(m.elements, m.recues);
      if (!propose) continue;
      const x = reponses.find((r) => r.champId === c.id && r.projetId === m.projetId);
      if (!x) await db.insert(schema.reponsesRapport).values({ rapportId: rapport.id, champId: c.id, projetId: m.projetId, valeur: propose, propose }).onConflictDoNothing();
      else if (x.valeur === (x.propose ?? "") && !x.proposeParIa && x.propose !== propose)
        await db.update(schema.reponsesRapport).set({ valeur: propose, propose, majLe: new Date() }).where(eq(schema.reponsesRapport.id, x.id));
    }
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// « Décision ou aide attendue » : propositions à partir des blocages et des échéances dépassées
// ---------------------------------------------------------------------------

export type Suggestion = { texte: string; projetId: string | null };

export async function suggestionsPourDecision(rapport: typeof schema.rapportsHebdo.$inferSelect, champ: Champ): Promise<Suggestion[]> {
  const taches = await db
    .select({ titre: schema.taches.titre, statut: schema.taches.statut, blocage: schema.taches.blocage, echeance: schema.taches.echeance, projetId: schema.taches.projetId, projetCode: schema.projets.code })
    .from(schema.taches)
    .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
    .where(and(eq(schema.taches.assigneId, rapport.auteurId), ne(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe)));
  const f = formulaireDe(rapport);
  const [lignes, reponses] = await Promise.all([lignesDuRapport(rapport.id), reponsesDuRapport(rapport.id)]);
  const propres = lignes.filter((l) => l.origines.length === 0);
  const bloquees = propres.filter((l) => l.partie === "bloque" && f.find((c) => c.id === l.champId)?.partie !== "equipe").map((l) => l.texte);
  const deja = [...propres.filter((l) => l.champId === champ.id).map((l) => l.texte), ...reponses.filter((x) => x.champId === champ.id).flatMap((x) => x.valeur.split("\n"))];
  const textes = suggestionsDecision(taches, bloquees, aujourdhui(), deja);
  // Le projet d'une proposition : celui de la tâche dont elle parle.
  return textes.map((t) => ({ texte: t, projetId: taches.find((x) => x.projetCode && t.startsWith(`${x.projetCode} · `) && t.includes(x.titre.trim().replace(/[.;\s]+$/, "")))?.projetId ?? null }));
}
