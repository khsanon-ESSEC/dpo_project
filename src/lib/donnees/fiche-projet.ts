/**
 * Fiche de projet à exporter (demandé le 29 octobre 2026) : une synthèse du projet, la même pour la page imprimable
 * (PDF par l'impression du navigateur) et pour le fichier Word. Assemblée ici une fois, rendue deux fois.
 * Elle montre ce que la personne voit déjà sur la fiche du projet : le budget à qui gère le projet, la liste des
 * documents à qui peut les lire.
 */
import "server-only";
import { cadrageValide, lignesCadrage } from "@/lib/cadrage";
import { db, schema } from "@/db";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Acces } from "@/lib/acces";
import { aujourdhui } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { LIBELLE_ETAT_LIVRABLE, LIBELLE_STATUT_PROJET, peutGererProjet } from "@/lib/projets";
import { gravite, LIBELLE_GRAVITE, phaseDepassee, phaseEnCours } from "@/lib/risques";
import { LIBELLE_OBJECTIFS, LIBELLE_PRIORITE, partEngagee, priorite, type Objectifs } from "@/lib/suivi";
import { CATEGORIES_DOCUMENT, estCategorie } from "@/lib/documents";
import type { Raci } from "@/lib/raci";
import { acteur, membresDuProjet } from "./gestion";
import { livrablesDuProjet } from "./livrables";
import { phasesDuProjet, risquesDuProjet } from "./risques";
import { decisionsDuProjet } from "./decisions";
import { reportsFinDe } from "./reports-fin";
import { objectifsDuProjet } from "./objectifs";
import { nomsPourRaci, raciDuProjet } from "./raci";
import { documentsDuProjet, peutLireDocuments } from "./documents";

const SANTE: Record<string, string> = { dans_les_temps: "Dans les temps", a_surveiller: "À surveiller", en_retard: "En retard" };
const EVALUATION: Record<string, string> = { oui: "Atteint", en_partie: "Atteint en partie", non: "Pas atteint" };

export type FicheProjet = NonNullable<Awaited<ReturnType<typeof ficheAExporter>>>;

export async function ficheAExporter(a: Acces, projetId: string) {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return null;
  const jour = aujourdhui();
  const org = await chargerOrganisation();
  const nom = (id: string | null) => {
    const x = id ? org.personnes.get(id) : undefined;
    return x ? nomComplet(x) : null;
  };
  const gere = peutGererProjet(acteur(a), p);
  const lisDocuments = await peutLireDocuments(a, p);
  const [membres, lv, phases, risques, decisions, reports, objs, rc, documents, taches] = await Promise.all([
    membresDuProjet(projetId),
    livrablesDuProjet(projetId, jour),
    phasesDuProjet(projetId),
    risquesDuProjet(projetId),
    decisionsDuProjet(projetId),
    reportsFinDe(projetId),
    objectifsDuProjet(projetId),
    raciDuProjet(projetId),
    lisDocuments ? documentsDuProjet(projetId) : Promise.resolve(null),
    db
      .select({ statut: schema.taches.statut, echeance: schema.taches.echeance, n: count() })
      .from(schema.taches)
      .where(and(eq(schema.taches.projetId, projetId), isNull(schema.taches.annuleeLe)))
      .groupBy(schema.taches.statut, schema.taches.echeance),
  ]);
  const nomsRaci = await nomsPourRaci(p, rc.raci, 6);
  const enCours = phaseEnCours(phases, jour);
  const nomPhase = new Map(phases.map((ph) => [ph.id, ph.nom]));
  let ouvertes = 0;
  let faites = 0;
  let bloquees = 0;
  let enRetard = 0;
  for (const t of taches) {
    const n = Number(t.n);
    if (t.statut === "faite") faites += n;
    else {
      ouvertes += n;
      if (t.statut === "bloquee") bloquees += n;
      else if (t.echeance && t.echeance < jour) enRetard += n;
    }
  }

  return {
    editeLe: jour,
    editePar: nomComplet(a.moi),
    projet: {
      id: p.id,
      code: p.code,
      titre: p.titre,
      description: p.description,
      justification: p.justification,
      programme: p.programme,
      division: p.division || "DPO",
      statut: LIBELLE_STATUT_PROJET[p.statut] ?? p.statut,
      priorite: LIBELLE_PRIORITE[priorite(p.priorite)],
      strategique: p.strategique,
      sante: p.statut === "requete" || p.statut === "refuse" || p.statut === "finalise" ? null : SANTE[p.sante],
      santeMotif: p.sante !== "dans_les_temps" ? p.santeMotif : "",
      archive: !!p.archiveLe,
      /** Les cases de la fiche de projet de la DPO (type de solution, informations disponibles, spécialisations). */
      cadrage: (() => {
        const c = cadrageValide(p.cadrage);
        return c ? lignesCadrage(c) : [];
      })(),
    },
    personnes: {
      sponsor: nom(p.sponsorId),
      chef: nom(p.chefProjetId),
      referent: nom(p.referentId),
      membres: membres.map((m) => ({ nom: m.nom, role: m.role || m.poste || "", externe: m.externe ? m.organisation || "hors division" : "" })),
    },
    dates: {
      entree: p.dateEntree,
      finInitiale: p.dateFinInitiale,
      finPrevue: p.dateFinPrevue,
      lancement: p.dateLancementPrevue,
      reports: reports
        .slice(-5)
        .reverse()
        .map((r) => ({ avant: r.avant, apres: r.apres, motif: r.motif })),
      nbReports: reports.length,
    },
    objectifs: objs.objectifs.map((o) => ({ libelle: o.libelle, evaluation: o.evaluation ? (EVALUATION[o.evaluation] ?? "") : "" })),
    benefices: objs.benefices.map((b) => ({ libelle: b.libelle, indicateur: b.indicateur, depart: b.depart, cible: b.cible, constate: b.constate, constateLe: b.constateLe })),
    phases: phases.map((ph) => ({
      nom: ph.nom,
      debut: ph.debut,
      fin: ph.fin,
      etat: ph.termineeLe ? "Terminée" : ph.id === enCours?.id ? (phaseDepassee(ph, jour) ? "En cours, fin dépassée" : "En cours") : phaseDepassee(ph, jour) ? "Fin dépassée" : "À venir",
    })),
    livrables: lv.livrables.map((l) => ({
      libelle: l.libelle,
      prevuLe: l.prevuLe,
      responsable: l.responsable,
      etat: LIBELLE_ETAT_LIVRABLE[l.affiche] ?? l.affiche,
      enRetard: l.enRetard,
      phase: l.phaseId ? (nomPhase.get(l.phaseId) ?? null) : null,
      taches: l.compte.total ? `${l.compte.faites}/${l.compte.total}` : "",
    })),
    raci: rc.raci as Raci,
    raciPropre: rc.propre,
    nomsRaci,
    risques: risques
      .filter((r) => r.statut === "ouvert")
      .map((r) => ({ titre: r.titre, gravite: LIBELLE_GRAVITE[gravite(r.probabilite, r.impact)], responsable: r.responsable, reponse: r.reponse })),
    risquesMaitrises: risques.filter((r) => r.statut === "maitrise").length,
    decisions: decisions.slice(0, 6).map((d) => ({ texte: d.texte, le: d.decideeLe, instance: d.instance })),
    nbDecisions: decisions.length,
    budget: gere && (p.budgetPrevu !== null || p.budgetEngage !== null) ? { prevu: p.budgetPrevu, engage: p.budgetEngage, devise: p.budgetDevise, note: p.budgetNote, part: partEngagee(p.budgetPrevu, p.budgetEngage), majLe: p.budgetMajLe } : null,
    avancement: { ouvertes, faites, bloquees, enRetard, total: ouvertes + faites, livrablesValides: lv.livrables.filter((l) => l.etat === "atteint").length, livrables: lv.livrables.length },
    cloture:
      p.statut === "finalise" && p.clotureLe
        ? { le: p.clotureLe, par: nom(p.clotureParId), objectifs: p.objectifsAtteints ? (LIBELLE_OBJECTIFS[p.objectifsAtteints as Objectifs] ?? p.objectifsAtteints) : "", bilan: p.bilanCloture, lecons: p.leconsApprises }
        : null,
    documents: documents ? documents.map((d) => ({ nom: d.nom, categorie: CATEGORIES_DOCUMENT[estCategorie(d.categorie) ? d.categorie : "autre"] })) : null,
  };
}
