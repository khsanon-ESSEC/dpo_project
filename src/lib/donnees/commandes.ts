/**
 * Les actions de la barre (src/lib/commandes.ts) faites côté serveur : la phrase est relue ici avec les données
 * que la personne a le droit de voir, puis chaque action passe par la même fonction que l'écran correspondant,
 * avec les mêmes règles. Testé dans tests/commandes-base.test.ts.
 */
import "server-only";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { contactsVisibles, idsProjetsVisibles, type Acces } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { analyserCommande, type ContexteCommande } from "@/lib/commandes";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { peutDeciderDemande, peutGererProjet, peutTenirLesRegistres } from "@/lib/projets";
import { nomComplet, redigeUnRapport } from "@/lib/regles";
import { phaseEnCours } from "@/lib/risques";
import { LIBELLE_OBJECTIFS, LIBELLE_PRIORITE, montantTexte } from "@/lib/suivi";
import { contenuDecision, contenuRisque, enregistrerAnnulation } from "./annulations";
import type { ResultatBarre } from "./barre";
import { cloturerProjet, enregistrerBudget, rouvrirProjet } from "./cloture";
import { creerRapportPonctuel } from "./conseil";
import { noterDecision } from "./decisions";
import { acteur, ajouterLivrable, ajouterMembre, deciderDemande, modifierLivrable, modifierProjet, proposerProjet, retirerMembre, type ModifProjet } from "./gestion";
import { agirSurLivrable } from "./livrables";
import { envoyerRapport, semaineCourante } from "./rapport";
import { ajouterPhase, changerStatutRisque, enregistrerRisque, terminerPhase, utiliserPhasesTypes } from "./risques";

type Projet = typeof schema.projets.$inferSelect;

/** Projets visibles que la barre peut viser : acceptés, pas archivés (un projet clôturé se rouvre). */
async function projetsPourCommandes(a: Acces) {
  const visibles = await idsProjetsVisibles(a);
  const l = await db
    .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, statut: schema.projets.statut })
    .from(schema.projets)
    .where(and(ne(schema.projets.statut, "requete"), ne(schema.projets.statut, "refuse"), isNull(schema.projets.archiveLe)));
  return l.filter((p) => visibles === "tous" || visibles.has(p.id));
}

/** Ce que la barre connaît pour reconnaître une action : projets, personnes, livrables, phases et risques visibles. */
export async function contexteCommande(u: Utilisateur, a: Acces): Promise<ContexteCommande> {
  const projets = await projetsPourCommandes(a);
  const ids = projets.map((p) => p.id);
  const org = await chargerOrganisation();
  const contacts = u.externe ? await contactsVisibles(a) : null;
  const [livrables, phases, risques] = ids.length
    ? await Promise.all([
        db.select({ id: schema.indicateurs.id, projetId: schema.indicateurs.projetId, libelle: schema.indicateurs.libelle, etat: schema.indicateurs.etat }).from(schema.indicateurs).where(inArray(schema.indicateurs.projetId, ids)),
        db.select({ id: schema.phasesProjet.id, projetId: schema.phasesProjet.projetId, libelle: schema.phasesProjet.nom, ordre: schema.phasesProjet.ordre, termineeLe: schema.phasesProjet.termineeLe }).from(schema.phasesProjet).where(inArray(schema.phasesProjet.projetId, ids)),
        db.select({ id: schema.risquesProjet.id, projetId: schema.risquesProjet.projetId, libelle: schema.risquesProjet.titre, etat: schema.risquesProjet.statut }).from(schema.risquesProjet).where(inArray(schema.risquesProjet.projetId, ids)),
      ])
    : [[], [], []];
  return {
    projets: projets.map(({ id, code, titre }) => ({ id, code, titre })),
    personnes: [...org.personnes.values()].filter((p) => p.actif && (!contacts || contacts.has(p.id) || p.id === u.id)).map((p) => ({ id: p.id, nom: nomComplet(p) })),
    livrables,
    phases: phases.sort((x, y) => x.ordre - y.ordre).map((p) => ({ id: p.id, projetId: p.projetId, libelle: p.libelle, etat: p.termineeLe ? "terminee" : "ouverte" })),
    risques,
    aujourdhui: aujourdhui(),
    moiId: u.id,
  };
}

const nomDe = (ctx: ContexteCommande, id: string | null) => (id ? (ctx.personnes.find((p) => p.id === id)?.nom ?? "?") : "");

/** Les champs du formulaire « Modifier le projet », tels qu'ils sont (pour n'en changer qu'un). */
function champsDu(p: Projet): ModifProjet {
  return {
    code: p.code,
    titre: p.titre,
    description: p.description,
    programme: p.programme,
    strategique: p.strategique,
    statut: p.statut,
    chefProjetId: p.chefProjetId ?? "",
    referentId: p.referentId ?? "",
    division: p.division,
    dateEntree: p.dateEntree ?? "",
    dateFinInitiale: p.dateFinInitiale ?? "",
    dateFinPrevue: p.dateFinPrevue ?? "",
    dateLancementPrevue: p.dateLancementPrevue ?? "",
  };
}

const CHAMPS_ANNULABLES = ["sponsorId", "chefProjetId", "priorite", "budgetPrevu", "budgetEngage", "budgetDevise", "budgetNote", "budgetMajLe"] as const;
const instantane = (p: Projet) => Object.fromEntries(CHAMPS_ANNULABLES.map((k) => [k, p[k]])) as Record<(typeof CHAMPS_ANNULABLES)[number], unknown>;

export async function executerCommande(u: Utilisateur, a: Acces, o: { saisie: string; projetId: string }): Promise<ResultatBarre> {
  const ctx = await contexteCommande(u, a);
  const choisi = o.projetId ? (ctx.projets.find((p) => p.id === o.projetId) ?? null) : null;
  if (o.projetId && !choisi) return { message: "Projet introuvable." };
  const r = analyserCommande(o.saisie, ctx, choisi);
  if (!r) return { message: "Je n'ai pas reconnu d'action dans cette phrase : « > » montre tout ce que la barre sait faire." };
  if (r.manque) return { message: r.manque };
  if (r.choix || !r.commande) return { message: "Choisissez dans la liste ce que vous voulez faire." };
  const c = r.commande;
  const jour = aujourdhui();
  const depuis = new Date();
  const lireProjet = async (id: string) => (await db.select().from(schema.projets).where(eq(schema.projets.id, id)))[0] ?? null;
  const gere = (p: Projet | null): p is Projet => !!p && peutGererProjet(acteur(a), p);
  const refusGestion = { message: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs font cette action sur ce projet." };

  // Actions sans projet.
  if (c.type === "aller") return { message: r.resume, ok: true, lien: c.lien };
  if (c.type === "nouveau_projet") {
    if (u.externe) return { message: "Proposer un projet est réservé à la division." };
    const n = await proposerProjet({ titre: c.titre, description: "", justification: c.justification, programme: "", strategique: c.strategique, finSouhaitee: c.fin ?? "", chefSuggereId: c.chefId ?? "", code: c.code ?? "", division: "" }, u.id);
    if ("erreur" in n) return { message: n.erreur };
    const [p] = await db.select({ code: schema.projets.code }).from(schema.projets).where(eq(schema.projets.id, n.id));
    let accepte = false;
    if (c.chefId && peutDeciderDemande(a, { demandeParId: u.id })) {
      const d = await deciderDemande(n.id, { accepte: true, motif: "", statut: "en_cours", chefProjetId: c.chefId, dateEntree: jour, dateFinPrevue: c.fin ?? "", strategique: c.strategique }, u.id);
      accepte = !("erreur" in d);
    }
    const annulation = await enregistrerAnnulation(u.id, { genre: "projet_cree", projetId: n.id });
    return {
      message: accepte ? `Projet ${p.code} « ${c.titre} » créé, en cours, avec ${nomDe(ctx, c.chefId)} comme chef de projet.` : `Projet ${p.code} « ${c.titre} » proposé : la direction est prévenue.`,
      ok: true,
      annulation,
      lien: `/projets/${n.id}`,
      projetId: n.id,
    };
  }
  if (c.type === "envoyer_rapport") {
    if (!redigeUnRapport(u)) return { message: "Vous ne rédigez pas de rapport du vendredi." };
    const [rap] = await db
      .select({ id: schema.rapportsHebdo.id, statut: schema.rapportsHebdo.statut })
      .from(schema.rapportsHebdo)
      .where(and(eq(schema.rapportsHebdo.auteurId, u.id), eq(schema.rapportsHebdo.semaine, semaineCourante())))
      .orderBy(desc(schema.rapportsHebdo.creeLe))
      .limit(1);
    if (!rap) return { message: "Votre rapport de la semaine n'est pas encore commencé : ouvrez-le pour le relire avant de l'envoyer.", lien: "/rapport" };
    if (rap.statut !== "brouillon") return { message: "Votre rapport de la semaine est déjà parti.", ok: true, lien: `/rapports/${rap.id}` };
    const e = await envoyerRapport(rap.id, u.id);
    if (!e) return { message: "Ce rapport ne s'envoie pas d'ici : ouvrez-le.", lien: "/rapport" };
    if (!e.ok) return { message: `Il manque encore : ${e.manquants.join(", ")}. Complétez le rapport avant de l'envoyer.`, lien: "/rapport#envoi" };
    return { message: "Rapport de la semaine envoyé à votre supérieur.", ok: true, lien: `/rapports/${rap.id}` };
  }
  if (c.type === "rapport_ponctuel") {
    if (u.externe || (!a.toutVoir && !a.directeur)) return { message: "Les rapports au conseil sont préparés par un directeur ou un exécutif." };
    const visibles = await idsProjetsVisibles(a);
    const strategiques = await db
      .select({ id: schema.projets.id })
      .from(schema.projets)
      .where(and(eq(schema.projets.strategique, true), eq(schema.projets.division, ""), ne(schema.projets.statut, "finalise"), ne(schema.projets.statut, "requete"), ne(schema.projets.statut, "refuse"), isNull(schema.projets.archiveLe)));
    const n = await creerRapportPonctuel({ titre: c.titre, objet: c.objet, depuis: "", projetIds: strategiques.map((x) => x.id) }, u.id, visibles);
    if ("erreur" in n) return { message: n.erreur };
    return { message: `Rapport ponctuel « ${c.titre} » préparé sur les projets stratégiques : relisez-le avant de l'envoyer.`, ok: true, lien: `/conseil/ponctuels/${n.id}` };
  }

  // Actions sur un projet.
  if (!r.projet) return { message: "Quel projet ? Écrivez son code en tête (« UR … ») ou choisissez-le avec « / »." };
  const pid = r.projet.id;
  const code = r.projet.code;
  const p = await lireProjet(pid);
  if (!p) return { message: "Projet introuvable." };
  const finir = async (message: string, annulable?: Parameters<typeof enregistrerAnnulation>[1]): Promise<ResultatBarre> => ({
    message: `${code} · ${message}`,
    ok: true,
    annulation: annulable ? await enregistrerAnnulation(u.id, annulable) : undefined,
    lien: `/projets/${pid}`,
    projetId: pid,
  });

  switch (c.type) {
    case "livrable_creer": {
      if (!gere(p)) return refusGestion;
      const depuis = new Date().toISOString();
      const n = await ajouterLivrable(pid, { libelle: c.libelle, prevuLe: c.prevuLe, responsableId: c.responsableId, critere: "" }, u.id);
      if ("erreur" in n) return { message: n.erreur };
      return finir(`Livrable « ${c.libelle} » ajouté${c.prevuLe ? `, prévu le ${dateCourte(c.prevuLe)}` : ""}${c.responsableId ? `, responsable ${nomDe(ctx, c.responsableId)}${c.responsableId !== u.id ? " (prévenu)" : ""}` : ""}.`, { genre: "jalon", projetId: pid, indicateurId: n.id, depuis, responsableId: c.responsableId ?? null });
    }
    case "livrable_modifier": {
      if (!gere(p)) return refusGestion;
      const [l] = await db.select().from(schema.indicateurs).where(and(eq(schema.indicateurs.id, c.livrableId), eq(schema.indicateurs.projetId, pid)));
      if (!l) return { message: "Livrable introuvable." };
      const apres = { prevuLe: c.prevuLe ?? l.prevuLe, responsableId: c.responsableId ?? l.responsableId };
      const depuis = new Date().toISOString();
      const m = await modifierLivrable(pid, l.id, { libelle: l.libelle, prevuLe: apres.prevuLe, responsableId: apres.responsableId, critere: l.critere }, u.id);
      if ("erreur" in m) return { message: m.erreur };
      return finir(
        `Livrable « ${l.libelle} » : ${[c.responsableId ? `confié à ${nomDe(ctx, c.responsableId)}${c.responsableId !== u.id && c.responsableId !== l.responsableId ? " (prévenu)" : ""}` : null, c.prevuLe ? `prévu le ${dateCourte(c.prevuLe)}` : null].filter(Boolean).join(", ")}.`,
        { genre: "livrable", projetId: pid, livrableId: l.id, avant: { prevuLe: l.prevuLe, responsableId: l.responsableId }, apres, depuis },
      );
    }
    case "livrable_etat": {
      const [l] = await db.select({ libelle: schema.indicateurs.libelle, projetId: schema.indicateurs.projetId }).from(schema.indicateurs).where(eq(schema.indicateurs.id, c.livrableId));
      if (!l || l.projetId !== pid) return { message: "Livrable introuvable." };
      const e = await agirSurLivrable(a, c.livrableId, c.action, c.remarque);
      if ("erreur" in e) return { message: e.erreur };
      return finir(`« ${l.libelle} » : ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}`);
    }
    case "membre_ajouter": {
      if (!gere(p)) return refusGestion;
      if (p.chefProjetId === c.personneId) return { message: `${nomDe(ctx, c.personneId)} est le chef de ce projet.` };
      const [deja] = await db.select({ id: schema.membresProjet.id }).from(schema.membresProjet).where(and(eq(schema.membresProjet.projetId, pid), eq(schema.membresProjet.personneId, c.personneId)));
      if (deja) return { message: `${nomDe(ctx, c.personneId)} fait déjà partie de l'équipe.` };
      await ajouterMembre(pid, c.personneId, c.role, u.id);
      const [n] = await db.select({ id: schema.membresProjet.id }).from(schema.membresProjet).where(and(eq(schema.membresProjet.projetId, pid), eq(schema.membresProjet.personneId, c.personneId)));
      if (!n) return { message: "Cette personne n'est plus active." };
      return finir(`${nomDe(ctx, c.personneId)} rejoint l'équipe${c.role ? ` (${c.role.toLowerCase()})` : ""}.`, { genre: "membre", projetId: pid, membreId: n.id });
    }
    case "membre_retirer": {
      if (!gere(p)) return refusGestion;
      const [m] = await db.select({ id: schema.membresProjet.id }).from(schema.membresProjet).where(and(eq(schema.membresProjet.projetId, pid), eq(schema.membresProjet.personneId, c.personneId)));
      if (!m) return { message: `${nomDe(ctx, c.personneId)} ne fait pas partie de l'équipe.` };
      await retirerMembre(pid, m.id, u.id);
      return finir(`${nomDe(ctx, c.personneId)} quitte l'équipe (ses tâches ouvertes restent à elle ou à lui).`);
    }
    case "decision": {
      const d = await noterDecision(a, pid, { texte: c.texte, decideeLe: jour, instance: c.instance, contexte: "" });
      if ("erreur" in d) return { message: d.erreur };
      const [dn] = await db.select().from(schema.decisionsProjet).where(eq(schema.decisionsProjet.id, d.id));
      return finir(`Décision notée au registre : « ${c.texte} »${c.instance ? ` (${c.instance})` : ""}.`, { genre: "decision", projetId: pid, decisionId: d.id, apres: dn ? contenuDecision(dn) : undefined });
    }
    case "risque_creer": {
      const n = await enregistrerRisque(a, pid, null, { titre: c.titre, description: "", probabilite: c.probabilite, impact: c.impact, responsableId: c.responsableId, reponse: "", revueLe: null });
      if ("erreur" in n) return { message: n.erreur };
      const crit = c.probabilite * c.impact;
      const [rn] = await db.select().from(schema.risquesProjet).where(eq(schema.risquesProjet.id, n.id));
      return finir(`Risque noté au registre : « ${c.titre} » (${crit >= 6 ? "critique" : crit >= 3 ? "modéré" : "faible"}).`, { genre: "risque", projetId: pid, risqueId: n.id, apres: rn ? contenuRisque(rn) : undefined });
    }
    case "risque_statut": {
      const [x] = await db.select().from(schema.risquesProjet).where(and(eq(schema.risquesProjet.id, c.risqueId), eq(schema.risquesProjet.projetId, pid)));
      if (!x) return { message: "Risque introuvable." };
      if (x.statut === c.statut) return { message: `Ce risque est déjà ${c.statut === "maitrise" ? "maîtrisé" : c.statut === "clos" ? "clos" : "ouvert"}.` };
      const s = await changerStatutRisque(a, pid, c.risqueId, c.statut);
      if ("erreur" in s) return { message: s.erreur };
      return finir(`Risque « ${x.titre} » ${c.statut === "maitrise" ? "maîtrisé" : c.statut === "clos" ? "clos" : "rouvert"}.`, { genre: "risque_statut", projetId: pid, risqueId: x.id, avant: x.statut, apresStatut: c.statut });
    }
    case "phase_terminer": {
      const phases = await db.select().from(schema.phasesProjet).where(eq(schema.phasesProjet.projetId, pid));
      const ph = c.phaseId ? phases.find((x) => x.id === c.phaseId) : phaseEnCours(phases, jour);
      if (!ph) return { message: "Plus de phase en cours sur ce projet." };
      if (ph.termineeLe) return { message: `La phase « ${ph.nom} » est déjà terminée.` };
      const t = await terminerPhase(a, pid, ph.id, true);
      if ("erreur" in t) return { message: t.erreur };
      return finir(`Phase « ${ph.nom} » terminée.`, { genre: "phase", projetId: pid, phaseId: ph.id });
    }
    case "phases_types": {
      const t = await utiliserPhasesTypes(a, pid);
      if ("erreur" in t) return { message: t.erreur };
      return finir("Projet découpé en phases types, réparties sur sa durée : ajustez-les dans « Modifier le projet ».", { genre: "phases_types", projetId: pid, phases: t.phases });
    }
    case "phase_ajouter": {
      const t = await ajouterPhase(a, pid, { nom: c.nom, debut: c.debut, fin: c.fin });
      if ("erreur" in t) return { message: t.erreur };
      return finir(`Phase « ${c.nom} » ajoutée.`, { genre: "phase_ajoutee", projetId: pid, phaseId: t.id });
    }
    case "sponsor":
    case "chef":
    case "priorite": {
      if (!gere(p)) return refusGestion;
      const avant = instantane(p);
      const champs: ModifProjet =
        c.type === "sponsor" ? { ...champsDu(p), sponsorId: c.personneId ?? "" } : c.type === "chef" ? { ...champsDu(p), chefProjetId: c.personneId } : { ...champsDu(p), priorite: c.priorite };
      const m = await modifierProjet(pid, champs, u.id);
      if ("erreur" in m) return { message: m.erreur };
      const apres = await lireProjet(pid);
      const texte =
        c.type === "sponsor"
          ? c.personneId
            ? `Sponsor métier : ${nomDe(ctx, c.personneId)}${c.personneId !== u.id ? " (prévenu)" : ""}.`
            : "Plus de sponsor métier."
          : c.type === "chef"
            ? `Chef de projet : ${nomDe(ctx, c.personneId)}${c.personneId !== u.id ? " (prévenu)" : ""}.`
            : `Priorité ${LIBELLE_PRIORITE[c.priorite].toLowerCase()}.`;
      return finir(texte, { genre: "projet_champs", projetId: pid, apresMajLe: apres!.majLe.toISOString(), avant });
    }
    case "budget": {
      if (!gere(p)) return refusGestion;
      const avant = instantane(p);
      const b = await enregistrerBudget(a, pid, { prevu: c.prevu ?? p.budgetPrevu, engage: c.engage ?? p.budgetEngage, devise: c.devise ?? p.budgetDevise, note: p.budgetNote });
      if ("erreur" in b) return { message: b.erreur };
      const apres = (await lireProjet(pid))!;
      const part = apres.budgetPrevu && apres.budgetEngage !== null ? Math.round((apres.budgetEngage / apres.budgetPrevu) * 100) : null;
      return finir(
        `Budget : ${[apres.budgetPrevu !== null ? `prévu ${montantTexte(apres.budgetPrevu, apres.budgetDevise)}` : null, apres.budgetEngage !== null ? `engagé ${montantTexte(apres.budgetEngage, apres.budgetDevise)}${part !== null ? ` (${part} %)` : ""}` : null].filter(Boolean).join(", ")}.`,
        { genre: "projet_champs", projetId: pid, apresMajLe: apres.majLe.toISOString(), avant },
      );
    }
    case "cloturer": {
      const k = await cloturerProjet(a, pid, { clotureLe: null, bilan: c.bilan, objectifs: c.objectifs, lecons: "" });
      if ("erreur" in k) return { message: k.erreur };
      return finir(`Projet clôturé (objectifs ${LIBELLE_OBJECTIFS[c.objectifs].toLowerCase()}) : l'équipe est prévenue. Les leçons apprises s'ajoutent sur la fiche.`, { genre: "cloture", projetId: pid, depuis: depuis.toISOString() });
    }
    case "rouvrir": {
      const k = await rouvrirProjet(a, pid);
      if ("erreur" in k) return { message: k.erreur };
      return finir("Projet rouvert : il repart « en cours ».");
    }
  }
  return { message: "Action inconnue." };
}

/** Pour l'aperçu de la barre : les éléments des projets visibles et ce que la personne peut faire. */
export async function donneesCommandes(u: Utilisateur, a: Acces) {
  const ctx = await contexteCommande(u, a);
  const ids = ctx.projets.map((p) => p.id);
  const projets = ids.length ? await db.select().from(schema.projets).where(inArray(schema.projets.id, ids)) : [];
  return {
    livrables: ctx.livrables,
    phases: ctx.phases,
    risques: ctx.risques,
    personnesCommandes: ctx.personnes,
    projetsCommandes: ctx.projets,
    geres: projets.filter((p) => peutGererProjet(acteur(a), p)).map((p) => p.id),
    // Les registres des risques et des décisions : le chef, le référent et ceux qui gèrent le projet (29 octobre 2026).
    registres: projets.filter((p) => peutTenirLesRegistres(a.moi.id, peutGererProjet(acteur(a), p), p)).map((p) => p.id),
    droits: {
      interne: !u.externe,
      redige: redigeUnRapport(u),
      conseil: !u.externe && (a.toutVoir || a.directeur),
      chef: !u.externe && (a.equipeDirecte.length > 0 || a.directeur || a.toutVoir),
    },
  };
}
