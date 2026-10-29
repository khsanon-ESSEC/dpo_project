/**
 * Kit de démarrage d'un projet validé (décidé le 29 octobre 2026) : des phases, des livrables, des risques, des
 * bénéfices attendus et des personnes à associer, proposés d'après la fiche du projet (type de solution, informations
 * déjà disponibles, spécialisations de la DPO impliquées : src/lib/cadrage.ts). Sans IA : des règles, chaque élément
 * avec sa raison. Le chef de projet coche ce qu'il garde.
 *
 * Le contenu des règles est une première proposition [à valider par la DPO] : il se corrige ici.
 */
import type { Cadrage, InfoDisponible, Specialisation, TypeSolution } from "./cadrage";
import { PHASES_TYPES, repartirPhasesTypes } from "./risques";

type Phase = (typeof PHASES_TYPES)[number];
type Regle = { si: (c: Cadrage) => boolean; raison: (c: Cadrage) => string };

const a = (t: TypeSolution) => (c: Cadrage) => c.types.includes(t);
const sp = (s: Specialisation) => (c: Cadrage) => c.specialisations.includes(s);
const manque = (i: InfoDisponible) => (c: Cadrage) => !c.infos.includes(i);
const ou = (...f: ((c: Cadrage) => boolean)[]) => (c: Cadrage) => f.some((g) => g(c));
const toujours = () => true;
const R = {
  tout: () => "tout projet",
  type: (l: string) => () => `type de solution : ${l}`,
  sp: (l: string) => () => `spécialisation ${l}`,
  manque: (l: string) => () => `informations ${l} pas encore disponibles`,
};
const processus = ou(a("amelioration_processus"), a("nouveau_processus"));
const produit = ou(a("amelioration_produit"), a("nouveau_produit"));
const libType = (c: Cadrage, cles: TypeSolution[], libelles: Record<string, string>) => cles.filter((k) => c.types.includes(k)).map((k) => libelles[k]).join(", ");
const TYPES_COURTS: Record<string, string> = { amelioration_processus: "amélioration de processus", nouveau_processus: "nouveau processus", amelioration_produit: "amélioration de produit", nouveau_produit: "nouveau produit" };

/** Livrables : le nom, la phase où il tombe, ce qui le valide. */
const LIVRABLES: (Regle & { cle: string; libelle: string; phase: Phase; critere: string })[] = [
  { cle: "infos-techniques", libelle: "Informations techniques collectées", phase: "Cadrage", critere: "systèmes concernés, interfaces et contraintes connus", si: manque("techniques"), raison: R.manque("techniques") },
  { cle: "infos-organisationnelles", libelle: "Informations organisationnelles collectées", phase: "Cadrage", critere: "acteurs, règles et volumes connus", si: manque("organisationnelles"), raison: R.manque("organisationnelles") },
  { cle: "budget", libelle: "Budget estimé et approuvé", phase: "Cadrage", critere: "estimation approuvée par la direction", si: manque("financieres"), raison: R.manque("financières") },
  { cle: "note-cadrage", libelle: "Note de cadrage validée", phase: "Cadrage", critere: "signée par le sponsor métier et la direction", si: toujours, raison: R.tout },
  { cle: "planning", libelle: "Planning détaillé approuvé", phase: "Cadrage", critere: "jalons et ressources acceptés par le sponsor", si: sp("etudes"), raison: R.sp("Études, Planification et Conception") },
  { cle: "existant", libelle: "Analyse de l'existant et des besoins validée", phase: "Conception", critere: "validée par le métier", si: sp("etudes"), raison: R.sp("Études, Planification et Conception") },
  { cle: "processus-actuel", libelle: "Processus actuel cartographié", phase: "Conception", critere: "validé par les responsables du processus", si: a("amelioration_processus"), raison: R.type("amélioration de processus / procédures") },
  { cle: "processus-cible", libelle: "Processus cible modélisé", phase: "Conception", critere: "validé par le métier", si: processus, raison: (c) => `type de solution : ${libType(c, ["amelioration_processus", "nouveau_processus"], TYPES_COURTS)}` },
  { cle: "offre", libelle: "Offre du produit définie (caractéristiques, tarification)", phase: "Conception", critere: "approuvée par le métier", si: a("nouveau_produit"), raison: R.type("nouveau produit") },
  { cle: "ameliorations", libelle: "Améliorations du produit définies", phase: "Conception", critere: "priorisées avec le métier", si: a("amelioration_produit"), raison: R.type("amélioration de produit") },
  { cle: "cahier-charges", libelle: "Cahier des charges validé", phase: "Conception", critere: "validé par le métier et la DTI", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "solution-retenue", libelle: "Solution retenue (développement, achat ou paramétrage)", phase: "Conception", critere: "choix approuvé par la direction", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "solution-prete", libelle: "Solution développée ou paramétrée", phase: "Réalisation", critere: "prête pour la validation métier", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "procedure", libelle: "Procédure rédigée et validée", phase: "Réalisation", critere: "approuvée par Organisation et méthodes et le métier", si: processus, raison: (c) => `type de solution : ${libType(c, ["amelioration_processus", "nouveau_processus"], TYPES_COURTS)}` },
  { cle: "conformite", libelle: "Avis de conformité obtenu", phase: "Validation métier", critere: "avis favorable de la conformité", si: produit, raison: (c) => `type de solution : ${libType(c, ["amelioration_produit", "nouveau_produit"], TYPES_COURTS)}` },
  { cle: "validation-metier", libelle: "Validation métier faite", phase: "Validation métier", critere: "procès-verbal de validation signé", si: ou(sp("solutions"), processus), raison: (c) => (c.specialisations.includes("solutions") ? "spécialisation Solutions Technologiques" : `type de solution : ${libType(c, ["amelioration_processus", "nouveau_processus"], TYPES_COURTS)}`) },
  { cle: "plan-deploiement", libelle: "Plan de déploiement approuvé", phase: "Déploiement", critere: "entités, dates et responsables acceptés", si: sp("deploiement"), raison: R.sp("Déploiement & Formation") },
  { cle: "supports", libelle: "Supports de formation prêts", phase: "Déploiement", critere: "relus par le métier", si: sp("deploiement"), raison: R.sp("Déploiement & Formation") },
  { cle: "formes", libelle: "Utilisateurs formés", phase: "Déploiement", critere: "listes de présence des sessions", si: sp("deploiement"), raison: R.sp("Déploiement & Formation") },
  { cle: "mise-en-production", libelle: "Mise en production effectuée", phase: "Déploiement", critere: "solution utilisée en production", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "procedure-diffusee", libelle: "Procédure publiée et diffusée", phase: "Déploiement", critere: "publiée et communiquée aux équipes concernées", si: processus, raison: (c) => `type de solution : ${libType(c, ["amelioration_processus", "nouveau_processus"], TYPES_COURTS)}` },
  { cle: "lancement-produit", libelle: "Produit lancé", phase: "Déploiement", critere: "disponible pour les clients", si: a("nouveau_produit"), raison: R.type("nouveau produit") },
  { cle: "produit-ameliore", libelle: "Produit amélioré mis à disposition", phase: "Déploiement", critere: "disponible pour les clients", si: a("amelioration_produit"), raison: R.type("amélioration de produit") },
  { cle: "deploiement-termine", libelle: "Déploiement terminé dans les entités prévues", phase: "Déploiement", critere: "toutes les entités du plan en service", si: sp("deploiement"), raison: R.sp("Déploiement & Formation") },
  { cle: "bilan", libelle: "Bilan de clôture rédigé", phase: "Clôture", critere: "présenté au sponsor", si: toujours, raison: R.tout },
];

/** Risques : probabilité et impact de 1 (faible) à 3 (fort), et la réponse prévue. */
const RISQUES: (Regle & { cle: string; titre: string; probabilite: 1 | 2 | 3; impact: 1 | 2 | 3; reponse: string })[] = [
  { cle: "r-infos-techniques", titre: "Informations techniques incomplètes : le cadrage s'allonge", probabilite: 3, impact: 2, reponse: "Lister les questions techniques dès le cadrage et nommer qui y répond", si: manque("techniques"), raison: R.manque("techniques") },
  { cle: "r-infos-organisationnelles", titre: "Acteurs et règles mal connus : la solution ne répond pas au besoin", probabilite: 2, impact: 3, reponse: "Ateliers avec les responsables du métier avant la conception", si: manque("organisationnelles"), raison: R.manque("organisationnelles") },
  { cle: "r-budget", titre: "Coût non estimé : le budget ne suffit pas", probabilite: 2, impact: 2, reponse: "Faire estimer le coût et l'approuver avant la réalisation", si: manque("financieres"), raison: R.manque("financières") },
  { cle: "r-fournisseur", titre: "Le prestataire ou la DTI ne livre pas à temps", probabilite: 2, impact: 3, reponse: "Point d'avancement chaque semaine avec le fournisseur ; jalons au contrat", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "r-securite", titre: "La sécurité de la solution n'est pas validée avant la mise en production", probabilite: 2, impact: 3, reponse: "Planifier l'audit de sécurité avant la validation métier", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
  { cle: "r-metier", titre: "Le métier n'est pas disponible pour valider", probabilite: 2, impact: 2, reponse: "Réserver les dates de validation avec le sponsor dès le cadrage", si: ou(sp("solutions"), processus), raison: (c) => (c.specialisations.includes("solutions") ? "spécialisation Solutions Technologiques" : "type de solution : processus") },
  { cle: "r-changement", titre: "Les équipes concernées résistent au changement", probabilite: 2, impact: 2, reponse: "Associer les responsables dès la conception ; expliquer le pourquoi", si: processus, raison: (c) => `type de solution : ${libType(c, ["amelioration_processus", "nouveau_processus"], TYPES_COURTS)}` },
  { cle: "r-reglementaire", titre: "Une exigence réglementaire est découverte tard", probabilite: 2, impact: 3, reponse: "Consulter la conformité dès la conception du produit", si: produit, raison: (c) => `type de solution : ${libType(c, ["amelioration_produit", "nouveau_produit"], TYPES_COURTS)}` },
  { cle: "r-adoption", titre: "Les clients adoptent le produit plus lentement que prévu", probabilite: 2, impact: 2, reponse: "Plan de communication et suivi des premières semaines", si: a("nouveau_produit"), raison: R.type("nouveau produit") },
  { cle: "r-formation", titre: "Les utilisateurs ne sont pas disponibles pour la formation", probabilite: 2, impact: 2, reponse: "Calendrier de formation validé avec les responsables des entités", si: sp("deploiement"), raison: R.sp("Déploiement & Formation") },
];

/** Bénéfices attendus : l'indicateur qui les mesure (départ et cible restent à écrire). */
const BENEFICES: (Regle & { cle: string; libelle: string; indicateur: string })[] = [
  { cle: "b-delai", libelle: "Réduction du délai de traitement", indicateur: "Délai moyen de traitement", si: a("amelioration_processus"), raison: R.type("amélioration de processus / procédures") },
  { cle: "b-erreurs", libelle: "Moins d'erreurs et de reprises", indicateur: "Taux d'erreur ou de reprise", si: a("amelioration_processus"), raison: R.type("amélioration de processus / procédures") },
  { cle: "b-uniforme", libelle: "Un même processus appliqué partout", indicateur: "Part des dossiers traités selon la nouvelle procédure", si: a("nouveau_processus"), raison: R.type("nouveau processus") },
  { cle: "b-satisfaction", libelle: "Clients plus satisfaits", indicateur: "Taux de satisfaction ou nombre de réclamations", si: a("amelioration_produit"), raison: R.type("amélioration de produit") },
  { cle: "b-clients", libelle: "Nouveaux clients et revenus", indicateur: "Nombre de clients et revenus générés", si: a("nouveau_produit"), raison: R.type("nouveau produit") },
  { cle: "b-manuel", libelle: "Moins de travail manuel", indicateur: "Heures de travail manuel par mois", si: sp("solutions"), raison: R.sp("Solutions Technologiques") },
];

export type ElementKit = { cle: string; raison: string };
export type KitDeDemarrage = {
  /** Les phases types, réparties sur la durée du projet : seulement s'il n'a pas encore de phases. */
  phases: { nom: string; debut: string | null; fin: string | null }[];
  livrables: (ElementKit & { libelle: string; phase: string; critere: string; prevuLe: string | null })[];
  risques: (ElementKit & { titre: string; probabilite: number; impact: number; reponse: string })[];
  benefices: (ElementKit & { libelle: string; indicateur: string })[];
  personnes: (ElementKit & { personneId: string; nom: string; role: string })[];
};

/** Ce que le projet a déjà : le kit ne le repropose pas. */
export type ExistantProjet = {
  dateEntree: string | null;
  dateFinPrevue: string | null;
  phases: { nom: string; debut: string | null; fin: string | null }[];
  livrables: string[];
  risques: string[];
  benefices: string[];
  /** Places restantes pour les bénéfices (12 au plus par projet). */
  placesBenefices: number;
  /** Les personnes déjà dans l'équipe (chef, référent, membres). */
  equipe: string[];
};

/** Une équipe de la division : son nom et son responsable (pour proposer la personne d'une spécialisation). */
export type EquipeDivision = { nom: string; chefId: string | null; chefNom: string | null };

const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Le kit pour ce projet. Sans fiche remplie (`null`), seulement ce qui vaut pour tout projet. */
export function kitDeDemarrage(cadrage: Cadrage | null, ex: ExistantProjet, equipes: EquipeDivision[] = []): KitDeDemarrage {
  const c: Cadrage = cadrage ?? { types: [], infos: ["techniques", "organisationnelles", "financieres"], specialisations: [] };
  const phases = ex.phases.length ? [] : repartirPhasesTypes(ex.dateEntree, ex.dateFinPrevue);
  // La date d'un livrable : la fin de sa phase (celles du projet, sinon celles que le kit propose).
  const finDe = (nom: string) => (ex.phases.length ? ex.phases : phases).find((p) => cle(p.nom) === cle(nom))?.fin ?? null;
  const deja = (l: string[]) => new Set(l.map(cle));
  const lv = deja(ex.livrables);
  const rq = deja(ex.risques);
  const bf = deja(ex.benefices);
  const livrables = LIVRABLES.filter((x) => x.si(c) && !lv.has(cle(x.libelle))).map((x) => ({ cle: x.cle, libelle: x.libelle, phase: x.phase, critere: x.critere, prevuLe: finDe(x.phase), raison: x.raison(c) }));
  const risques = RISQUES.filter((x) => x.si(c) && !rq.has(cle(x.titre))).map((x) => ({ cle: x.cle, titre: x.titre, probabilite: x.probabilite, impact: x.impact, reponse: x.reponse, raison: x.raison(c) }));
  const benefices = BENEFICES.filter((x) => x.si(c) && !bf.has(cle(x.libelle)))
    .slice(0, Math.max(0, ex.placesBenefices))
    .map((x) => ({ cle: x.cle, libelle: x.libelle, indicateur: x.indicateur, raison: x.raison(c) }));
  // Personnes : le responsable de l'équipe de la division qui porte le nom d'une spécialisation cochée.
  const SPEC: Record<Specialisation, string> = { etudes: "Études, Planification et Conception", solutions: "Solutions Technologiques", deploiement: "Déploiement & Formation" };
  const personnes: KitDeDemarrage["personnes"] = [];
  for (const s of c.specialisations) {
    const e = equipes.find((x) => cle(x.nom) === cle(SPEC[s]) || cle(SPEC[s]).startsWith(cle(x.nom)) || cle(x.nom).startsWith(cle(SPEC[s])));
    if (e?.chefId && e.chefNom && !ex.equipe.includes(e.chefId) && !personnes.some((p) => p.personneId === e.chefId)) {
      personnes.push({ cle: `p-${s}`, personneId: e.chefId, nom: e.chefNom, role: e.nom, raison: `spécialisation ${SPEC[s]} : responsable de l'équipe ${e.nom}` });
    }
  }
  return { phases, livrables, risques, benefices, personnes };
}

export const tailleDuKit = (k: KitDeDemarrage) => (k.phases.length ? 1 : 0) + k.livrables.length + k.risques.length + k.benefices.length + k.personnes.length;
