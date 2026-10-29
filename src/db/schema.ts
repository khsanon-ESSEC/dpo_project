/**
 * Modèle de données de l'application.
 *
 * Règles d'organisation portées par le modèle :
 * - une personne appartient à une seule équipe (personnes.equipe_id) ;
 * - une personne a un seul supérieur (personnes.superieur_id). Si ce poste est vacant,
 *   les rapports remontent au niveau suivant (voir src/lib/regles.ts) ;
 * - une personne peut tenir plusieurs rôles à la fois :
 *   « chef de projet » et « chef d'équipe » viennent des faits (on dirige un projet,
 *   des personnes nous envoient leur rapport) ; « directeur » (voit sa direction),
 *   « exécutif » (voit tout) et « administrateur » (gère l'organisation et les accès)
 *   se cochent à la main, indépendamment les uns des autres, pour n'importe qui.
 */
import { sql } from "drizzle-orm";
import type { Champ, Genre, Horaires } from "../lib/modeles";
import {
  type AnyPgColumn,
  bigserial,
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const statutTache = pgEnum("statut_tache", ["a_faire", "en_cours", "bloquee", "faite"]);
/** requete : proposé, en attente de la direction ; refuse : demande refusée (gardée, avec son motif). */
export const statutProjet = pgEnum("statut_projet", ["requete", "en_attente", "en_cours", "continu", "finalise", "refuse"]);
export const santeProjet = pgEnum("sante_projet", ["dans_les_temps", "a_surveiller", "en_retard"]);
/** État d'un livrable : « prêt » = déclaré prêt à valider par son responsable ; « atteint » = validé par qui gère le projet. */
export const etatIndicateur = pgEnum("etat_indicateur", ["a_venir", "en_cours", "pret", "atteint"]);
export const statutRapport = pgEnum("statut_rapport", ["brouillon", "envoye"]);
export const statutConseil = pgEnum("statut_conseil", ["brouillon", "approuve", "envoye"]);

/** Contenu binaire (pièces jointes) : PostgreSQL bytea, lu et écrit en Buffer. */
const octets = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const equipes = pgTable("equipes", {
  id: uuid().primaryKey().defaultRandom(),
  nom: text().notNull().unique(),
  /** Responsable de l'équipe. Vide = poste vacant. */
  chefId: uuid("chef_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  equipeParenteId: uuid("equipe_parente_id").references((): AnyPgColumn => equipes.id, { onDelete: "set null" }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const personnes = pgTable(
  "personnes",
  {
    id: uuid().primaryKey().defaultRandom(),
    prenom: text().notNull(),
    nom: text().notNull(),
    /** Facultatif pour une personne hors division sans accès. */
    courriel: text().unique(),
    poste: text().notNull().default(""),
    /** Hors division : autre département de la banque, ou consultant. Sans équipe ni supérieur ici, sans rapport. */
    externe: boolean().notNull().default(false),
    /** Pour une personne hors division : son département ou sa société. */
    organisation: text().notNull().default(""),
    equipeId: uuid("equipe_id").references((): AnyPgColumn => equipes.id, { onDelete: "set null" }),
    /** Un seul supérieur. Vide = rattaché au responsable de l'équipe, ou à la direction. */
    superieurId: uuid("superieur_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
    /** Rôle « directeur » : voit les projets et les rapports des membres de sa direction (tous niveaux). */
    directeur: boolean().notNull().default(false),
    /** Rôle « exécutif » : voit tout. */
    executif: boolean().notNull().default(false),
    /** Rôle « administrateur » : gère les personnes, les équipes et les accès. Ne donne pas à lui seul accès aux rapports. */
    administrateur: boolean().notNull().default(false),
    actif: boolean().notNull().default(true),
    motDePasseHash: text("mot_de_passe_hash"),
    doitChangerMotDePasse: boolean("doit_changer_mot_de_passe").notNull().default(true),
    echecsConnexion: integer("echecs_connexion").notNull().default(0),
    bloqueJusqua: timestamp("bloque_jusqua", { withTimezone: true }),
    theme: text().notNull().default("auto"),
    /** Heures disponibles par semaine pour les tâches (charge de travail). */
    capaciteHeures: integer("capacite_heures").notNull().default(40),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("personnes_superieur_idx").on(t.superieurId), index("personnes_equipe_idx").on(t.equipeId)],
);

export const projets = pgTable("projets", {
  id: uuid().primaryKey().defaultRandom(),
  /** Deux à quatre lettres, affichées sur les étiquettes (UR, UN…). */
  code: text().notNull().unique(),
  titre: text().notNull(),
  description: text().notNull().default(""),
  programme: text().notNull().default(""),
  strategique: boolean().notNull().default(false),
  statut: statutProjet().notNull().default("en_cours"),
  /** Santé calculée par l'application (src/lib/sante.ts), son motif en clair, et depuis quand elle est à ce niveau. */
  sante: santeProjet().notNull().default("dans_les_temps"),
  santeMotif: text("sante_motif").notNull().default(""),
  santeLe: timestamp("sante_le", { withTimezone: true }),
  /** Risque signalé par le chef de projet (ce que les données ne montrent pas) : il ne peut qu'aggraver la santé. */
  risqueMotif: text("risque_motif").notNull().default(""),
  risqueLe: timestamp("risque_le", { withTimezone: true }),
  risqueParId: uuid("risque_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  chefProjetId: uuid("chef_projet_id").references(() => personnes.id, { onDelete: "set null" }),
  /** Projet d'une autre division : son nom (vide = la DPO). */
  division: text().notNull().default(""),
  /** Projet dont le chef est hors division : la personne de la DPO qui a ici les droits de chef de projet. */
  referentId: uuid("referent_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  dateEntree: date("date_entree"),
  dateFinInitiale: date("date_fin_initiale"),
  dateFinPrevue: date("date_fin_prevue"),
  dateLancementPrevue: date("date_lancement_prevue"),
  /** Demande de projet : qui l'a proposé, quand, et pourquoi. */
  demandeParId: uuid("demande_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  demandeLe: timestamp("demande_le", { withTimezone: true }),
  justification: text().notNull().default(""),
  /** Décision de la direction sur la demande (acceptée ou refusée), et son motif. */
  decisionParId: uuid("decision_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  decisionLe: timestamp("decision_le", { withTimezone: true }),
  motifDecision: text("motif_decision").notNull().default(""),
  /** Archivé : retiré du portefeuille, toujours lisible (un projet qui a une histoire ne se supprime pas). */
  archiveLe: timestamp("archive_le", { withTimezone: true }),
  archiveParId: uuid("archive_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  /** Sponsor métier (décision du 28 octobre 2026) : qui porte le besoin côté métier ; il voit le projet. */
  sponsorId: uuid("sponsor_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  /** Priorité : « haute », « normale » ou « basse ». */
  priorite: text().notNull().default("normale"),
  /**
   * Budget, minimal (décision du 28 octobre 2026, [à vérifier] : ce que la DPO suit aujourd'hui) : montant prévu,
   * montant engagé à date, devise, une note, et la date de mise à jour. Vu seulement par qui gère le projet.
   */
  budgetPrevu: bigint("budget_prevu", { mode: "number" }),
  budgetEngage: bigint("budget_engage", { mode: "number" }),
  budgetDevise: text("budget_devise").notNull().default("HTG"),
  budgetNote: text("budget_note").notNull().default(""),
  budgetMajLe: date("budget_maj_le"),
  /** Clôture : le jour, qui, le bilan, les objectifs (« oui », « en_partie », « non ») et les leçons apprises. */
  clotureLe: date("cloture_le"),
  clotureParId: uuid("cloture_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
  bilanCloture: text("bilan_cloture").notNull().default(""),
  objectifsAtteints: text("objectifs_atteints").notNull().default(""),
  leconsApprises: text("lecons_apprises").notNull().default(""),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Listes de référence des projets (demandé le 29 octobre 2026) : les programmes et les divisions proposés dans les
 * formulaires. Le projet garde le libellé (projets.programme, projets.division) : renommer une valeur renomme aussi
 * les projets qui la portent ; une valeur retirée n'est plus proposée, les projets qui la portent la gardent.
 */
export const listesProjet = pgTable(
  "listes_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** « programme » ou « division ». */
    genre: text().notNull(),
    libelle: text().notNull(),
    actif: boolean().notNull().default(true),
    creeParId: uuid("cree_par_id").references((): AnyPgColumn => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("listes_projet_libelle_idx").on(t.genre, sql`lower(${t.libelle})`)],
);

/** Équipe d'un projet : établie par le chef de projet. Les membres voient le projet et reçoivent ses tâches. */
export const membresProjet = pgTable(
  "membres_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id")
      .notNull()
      .references(() => projets.id, { onDelete: "cascade" }),
    personneId: uuid("personne_id")
      .notNull()
      .references(() => personnes.id, { onDelete: "cascade" }),
    /** Rôle dans le projet, en clair (« analyste », « développeur »…). */
    role: text().notNull().default(""),
    ajouteParId: uuid("ajoute_par_id").references(() => personnes.id, { onDelete: "set null" }),
    ajouteLe: timestamp("ajoute_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("membre_projet_unique").on(t.projetId, t.personneId), index("membres_projet_personne_idx").on(t.personneId)],
);

/**
 * Les livrables d'un projet (table historique « indicateurs » : les indicateurs vérifiables du rapport au conseil).
 * Un livrable a une date prévue et un responsable, qui détermine les tâches qui y mènent (taches.livrable_id),
 * le déclare prêt à valider ; qui gère le projet le valide (« atteint ») ou le renvoie avec une remarque.
 */
export const indicateurs = pgTable(
  "indicateurs",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    ordre: integer().notNull(),
    libelle: text().notNull(),
    etat: etatIndicateur().notNull().default("a_venir"),
    atteintLe: date("atteint_le"),
    /** Date prévue du livrable (facultative). */
    prevuLe: date("prevu_le"),
    /** Qui en est responsable : il en détermine les tâches et peut en confier à l'équipe du projet. */
    responsableId: uuid("responsable_id").references(() => personnes.id, { onDelete: "set null" }),
    /** Ce qui sera vérifié pour le valider (facultatif). */
    critere: text().notNull().default(""),
    pretLe: timestamp("pret_le", { withTimezone: true }),
    valideParId: uuid("valide_par_id").references(() => personnes.id, { onDelete: "set null" }),
    /** Remarque de qui gère le projet quand il renvoie le livrable à reprendre. */
    remarque: text().notNull().default(""),
    /** La phase du projet à laquelle appartient le livrable (facultatif). */
    phaseId: uuid("phase_id").references((): AnyPgColumn => phasesProjet.id, { onDelete: "set null" }),
  },
  (t) => [index("indicateurs_projet_idx").on(t.projetId), index("indicateurs_responsable_idx").on(t.responsableId)],
);

export const taches = pgTable(
  "taches",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Vide = tâche hors projet. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    titre: text().notNull(),
    assigneId: uuid("assigne_id").notNull().references(() => personnes.id),
    statut: statutTache().notNull().default("a_faire"),
    /** Début prévu (facultatif). Sert au Gantt et au calcul de la charge. */
    debut: date(),
    echeance: date(),
    /** Temps de travail estimé, en heures (facultatif ; voir src/lib/charge.ts pour la valeur par défaut). */
    estimationHeures: integer("estimation_heures"),
    blocage: text(),
    /** Précisions sur la tâche (facultatif). */
    description: text().notNull().default(""),
    creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    /** Annulée : retirée des listes, de la charge et des rapports, mais gardée avec son histoire. */
    annuleeLe: timestamp("annulee_le", { withTimezone: true }),
    annuleeParId: uuid("annulee_par_id").references(() => personnes.id, { onDelete: "set null" }),
    motifAnnulation: text("motif_annulation").notNull().default(""),
    /** Action décidée en réunion : la réunion d'où vient la tâche (facultatif). */
    reunionId: uuid("reunion_id").references((): AnyPgColumn => reunions.id, { onDelete: "set null" }),
    /** Le livrable du projet auquel la tâche mène (facultatif : une tâche peut rester hors livrable). */
    livrableId: uuid("livrable_id").references(() => indicateurs.id, { onDelete: "set null" }),
    /** Priorité : « haute », « normale » ou « basse ». */
    priorite: text().notNull().default("normale"),
    /** Occurrence d'une tâche récurrente : la règle qui l'a créée. */
    recurrenceId: uuid("recurrence_id").references((): AnyPgColumn => tachesRecurrentes.id, { onDelete: "set null" }),
  },
  (t) => [index("taches_assigne_idx").on(t.assigneId), index("taches_projet_idx").on(t.projetId), index("taches_reunion_idx").on(t.reunionId), index("taches_livrable_idx").on(t.livrableId), index("taches_recurrence_idx").on(t.recurrenceId)],
);

/**
 * Tâches récurrentes (décision du 28 octobre 2026) : une règle (chaque semaine tel jour, chaque mois tel jour)
 * qui crée la prochaine occurrence quelques jours avant son échéance. Créée depuis une tâche, qui sert de modèle.
 */
export const tachesRecurrentes = pgTable(
  "taches_recurrentes",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "cascade" }),
    livrableId: uuid("livrable_id").references(() => indicateurs.id, { onDelete: "set null" }),
    titre: text().notNull(),
    description: text().notNull().default(""),
    assigneId: uuid("assigne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    estimationHeures: integer("estimation_heures"),
    priorite: text().notNull().default("normale"),
    /** « semaine » (jour : 1 lundi … 5 vendredi) ou « mois » (jour : 1 à 28, ou 31 pour le dernier jour du mois). */
    frequence: text().notNull(),
    jour: integer().notNull(),
    /** L'échéance de la prochaine occurrence à créer. */
    prochaineLe: date("prochaine_le").notNull(),
    /** Arrêtée : plus d'occurrence. */
    arreteeLe: timestamp("arretee_le", { withTimezone: true }),
    creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("taches_recurrentes_prochaine_idx").on(t.prochaineLe)],
);

/**
 * Registre des risques d'un projet (décision du 28 octobre 2026) : probabilité et impact (1 faible, 2 moyen,
 * 3 fort), un responsable, la réponse prévue, et un statut (ouvert, maîtrisé, clos). Règles : src/lib/risques.ts.
 */
export const risquesProjet = pgTable(
  "risques_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    titre: text().notNull(),
    description: text().notNull().default(""),
    probabilite: integer().notNull().default(2),
    impact: integer().notNull().default(2),
    responsableId: uuid("responsable_id").references(() => personnes.id, { onDelete: "set null" }),
    /** Ce qui est prévu pour l'éviter ou en limiter l'effet. */
    reponse: text().notNull().default(""),
    /** « ouvert », « maitrise » (la réponse fonctionne, on surveille) ou « clos ». */
    statut: text().notNull().default("ouvert"),
    /** Prochaine revue prévue (facultatif). */
    revueLe: date("revue_le"),
    auteurId: uuid("auteur_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risques_projet_idx").on(t.projetId)],
);

/**
 * Phases d'un projet (décision du 28 octobre 2026) : une suite ordonnée (cadrage, conception, réalisation,
 * validation métier, déploiement, clôture… ou d'autres), avec des dates ; un livrable peut appartenir à une phase.
 */
export const phasesProjet = pgTable(
  "phases_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    ordre: integer().notNull(),
    nom: text().notNull(),
    debut: date(),
    fin: date(),
    /** Le jour où qui gère le projet l'a déclarée terminée. */
    termineeLe: date("terminee_le"),
  },
  (t) => [index("phases_projet_idx").on(t.projetId, t.ordre)],
);

/**
 * Objectifs et bénéfices attendus d'un projet (demandé le 29 octobre 2026) : « objectif » (une phrase, dit atteint
 * ou non à la clôture) ou « benefice » (avec, facultatifs, un indicateur, une valeur de départ, une cible, puis la
 * valeur constatée après le lancement). Règles : src/lib/objectifs.ts.
 */
export const objectifsProjet = pgTable(
  "objectifs_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    genre: text().notNull(),
    ordre: integer().notNull(),
    libelle: text().notNull(),
    indicateur: text().notNull().default(""),
    depart: text().notNull().default(""),
    cible: text().notNull().default(""),
    constate: text().notNull().default(""),
    constateLe: date("constate_le"),
    /** À la clôture : « oui », « en_partie » ou « non » (objectifs seulement). */
    evaluation: text().notNull().default(""),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("objectifs_projet_idx").on(t.projetId, t.genre, t.ordre)],
);

/**
 * RACI (demandé le 29 octobre 2026) : le RACI type de la DPO (cle « type », sans projet), et celui d'un projet qui
 * s'en écarte (cle = l'identifiant du projet). Règles : src/lib/raci.ts.
 */
export const raci = pgTable("raci", {
  cle: text().primaryKey(),
  projetId: uuid("projet_id").references(() => projets.id, { onDelete: "cascade" }),
  colonnes: jsonb().$type<{ libelle: string; qui: string }[]>().notNull(),
  lignes: jsonb().$type<{ activite: string; lettres: string[] }[]>().notNull(),
  majParId: uuid("maj_par_id").references(() => personnes.id, { onDelete: "set null" }),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Temps réellement passé sur une tâche (décision du 28 octobre 2026), noté par jour : pour comparer à l'estimation.
 * Compté pour la personne de la tâche ; noté par elle, ou par qui peut modifier la tâche (une tâche confiée hors division).
 */
export const tempsPasse = pgTable(
  "temps_passe",
  {
    id: uuid().primaryKey().defaultRandom(),
    tacheId: uuid("tache_id").notNull().references(() => taches.id, { onDelete: "cascade" }),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    jour: date().notNull(),
    minutes: integer().notNull(),
    note: text().notNull().default(""),
    noteParId: uuid("note_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("temps_passe_tache_idx").on(t.tacheId), index("temps_passe_personne_idx").on(t.personneId, t.jour)],
);

/**
 * Dépendances entre tâches d'un même projet (décision du 28 octobre 2026) : « tache » ne peut vraiment commencer
 * qu'une fois « precedente » faite. Pas de boucle ; quand la précédente est faite, la personne est prévenue.
 */
export const dependancesTache = pgTable(
  "dependances_tache",
  {
    tacheId: uuid("tache_id").notNull().references(() => taches.id, { onDelete: "cascade" }),
    precedenteId: uuid("precedente_id").notNull().references(() => taches.id, { onDelete: "cascade" }),
    creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tacheId, t.precedenteId] }), index("dependances_precedente_idx").on(t.precedenteId)],
);

/**
 * Réunions notées par l'équipe : elles prennent du temps de travail (la charge en tient compte),
 * apparaissent dans le rapport de la semaine, et la direction voit le temps passé en réunion.
 */
export const reunions = pgTable(
  "reunions",
  {
    id: uuid().primaryKey().defaultRandom(),
    titre: text().notNull(),
    jour: date().notNull(),
    /** « HH:MM », facultatif. */
    heure: text(),
    dureeMinutes: integer("duree_minutes").notNull(),
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    notes: text().notNull().default(""),
    /** Qui l'a notée (et peut la modifier). */
    noteeParId: uuid("notee_par_id").references(() => personnes.id, { onDelete: "set null" }),
    /** Réunion récurrente : la série dont elle fait partie (chaque occurrence est une réunion à part entière). */
    serieId: uuid("serie_id").references((): AnyPgColumn => seriesReunion.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reunions_jour_idx").on(t.jour), index("reunions_serie_idx").on(t.serieId)],
);

/**
 * Réunions récurrentes (demandé le 29 octobre 2026) : le rythme (chaque jour ouvré, chaque semaine, toutes les deux
 * semaines, chaque mois) et la date de fin. Les occurrences sont créées d'un coup, jusqu'à cette date (un an au plus).
 */
export const seriesReunion = pgTable("series_reunion", {
  id: uuid().primaryKey().defaultRandom(),
  rythme: text().notNull(),
  jusquau: date().notNull(),
  creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const participantsReunion = pgTable(
  "participants_reunion",
  {
    reunionId: uuid("reunion_id")
      .notNull()
      .references(() => reunions.id, { onDelete: "cascade" }),
    personneId: uuid("personne_id")
      .notNull()
      .references(() => personnes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.reunionId, t.personneId] }), index("participants_personne_idx").on(t.personneId)],
);

/** Historique des tâches : sert au brouillon du rapport du vendredi. */
export const evenementsTache = pgTable(
  "evenements_tache",
  {
    id: uuid().primaryKey().defaultRandom(),
    tacheId: uuid("tache_id").notNull().references(() => taches.id, { onDelete: "cascade" }),
    auteurId: uuid("auteur_id").references(() => personnes.id, { onDelete: "set null" }),
    type: text().notNull(), // creation | statut | blocage | note
    avant: text(),
    apres: text(),
    note: text(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evenements_tache_idx").on(t.tacheId, t.creeLe)],
);

/**
 * Modèles de rapport (voir src/lib/modeles.ts) : seuls les administrateurs les configurent.
 * Les champs vivent dans les versions ; un rapport garde une copie du formulaire rempli.
 */
export const modelesRapport = pgTable("modeles_rapport", {
  id: uuid().primaryKey().defaultRandom(),
  nom: text().notNull(),
  description: text().notNull().default(""),
  /** « individuel » : le rapport d'une personne ; « chef » : son travail, puis ce qu'il reçoit. */
  genre: text().$type<Genre>().notNull().default("individuel"),
  /** Le modèle de toute personne sans autre modèle (un seul). */
  parDefaut: boolean("par_defaut").notNull().default(false),
  /** Le modèle des personnes qui reçoivent des rapports, sauf affectation nominative (un seul). */
  pourChefs: boolean("pour_chefs").notNull().default(false),
  actif: boolean().notNull().default(true),
  /** Heures de la semaine : prêt à relire, rappel, à envoyer avant. Vide = horaires par défaut (src/lib/modeles.ts). */
  horaires: jsonb().$type<Horaires>(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

export const versionsModele = pgTable(
  "versions_modele",
  {
    id: uuid().primaryKey().defaultRandom(),
    modeleId: uuid("modele_id")
      .notNull()
      .references(() => modelesRapport.id, { onDelete: "cascade" }),
    numero: integer().notNull(),
    champs: jsonb().$type<Champ[]>().notNull(),
    /** brouillon (en préparation, un seul) | publiee (en service, une seule) | archivee */
    statut: text().$type<"brouillon" | "publiee" | "archivee">().notNull().default("brouillon"),
    /** Ce qui change dans cette version. */
    note: text().notNull().default(""),
    creeeParId: uuid("creee_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    publieeLe: timestamp("publiee_le", { withTimezone: true }),
    publieeParId: uuid("publiee_par_id").references(() => personnes.id, { onDelete: "set null" }),
  },
  (t) => [unique("version_modele_numero").on(t.modeleId, t.numero)],
);

/** Qui remplit quel modèle : une équipe ou une personne (une seule affectation chacune). */
export const affectationsModele = pgTable("affectations_modele", {
  id: uuid().primaryKey().defaultRandom(),
  modeleId: uuid("modele_id")
    .notNull()
    .references(() => modelesRapport.id, { onDelete: "cascade" }),
  equipeId: uuid("equipe_id")
    .unique("affectation_equipe")
    .references(() => equipes.id, { onDelete: "cascade" }),
  personneId: uuid("personne_id")
    .unique("affectation_personne")
    .references(() => personnes.id, { onDelete: "cascade" }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const rapportsHebdo = pgTable(
  "rapports_hebdo",
  {
    id: uuid().primaryKey().defaultRandom(),
    auteurId: uuid("auteur_id").notNull().references(() => personnes.id),
    /** Lundi de la semaine couverte. */
    semaine: date().notNull(),
    statut: statutRapport().notNull().default("brouillon"),
    /** Fixé à l'envoi : le supérieur à ce moment-là (poste vacant compris). */
    destinataireId: uuid("destinataire_id").references(() => personnes.id, { onDelete: "set null" }),
    envoyeLe: timestamp("envoye_le", { withTimezone: true }),
    /** Champs relus par l'auteur (identifiants de champ). */
    partiesRelues: text("parties_relues").array().notNull().default(sql`'{}'::text[]`),
    /** Version du modèle à la création ; vide = rapport d'avant les modèles (les quatre parties). */
    versionModeleId: uuid("version_modele_id").references(() => versionsModele.id, { onDelete: "set null" }),
    /** Formulaire rempli, copié à la création (« Mon travail » déplié) : un rapport garde sa version. */
    formulaire: jsonb().$type<Champ[]>(),
    /** Brouillon complété avec les tâches de la semaine à l'heure « prêt à relire » (ou à la demande). */
    completeLe: timestamp("complete_le", { withTimezone: true }),
    /** Lignes de tâches que l'auteur a retirées (« tâche:rubrique ») : on ne les remet pas en complétant. */
    ecartees: text().array().notNull().default(sql`'{}'::text[]`),
    /** Première ouverture du rapport envoyé par son destinataire (« Lu par … »). */
    luLe: timestamp("lu_le", { withTimezone: true }),
    luPar: uuid("lu_par").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("rapport_auteur_semaine").on(t.auteurId, t.semaine), index("rapports_destinataire_idx").on(t.destinataireId)],
);

/** « Répondre » : un mot sur un rapport envoyé, entre son auteur et ceux qui le lisent en entier. */
export const messagesRapport = pgTable(
  "messages_rapport",
  {
    id: uuid().primaryKey().defaultRandom(),
    rapportId: uuid("rapport_id")
      .notNull()
      .references(() => rapportsHebdo.id, { onDelete: "cascade" }),
    auteurId: uuid("auteur_id").notNull().references(() => personnes.id),
    texte: text().notNull(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_rapport_idx").on(t.rapportId, t.creeLe)],
);

export const lignesRapport = pgTable(
  "lignes_rapport",
  {
    id: uuid().primaryKey().defaultRandom(),
    rapportId: uuid("rapport_id").notNull().references(() => rapportsHebdo.id, { onDelete: "cascade" }),
    /** Champ du formulaire qui porte la ligne. */
    champId: text("champ_id").notNull(),
    /** Rubrique de la ligne (fait, en_cours, bloque, prochaine, decision) ; vide = autre. */
    partie: text(),
    texte: text().notNull(),
    /** Le chef de ce projet voit cette ligne. Vide = ligne générale, réservée au supérieur. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    tacheId: uuid("tache_id").references(() => taches.id, { onDelete: "set null" }),
    ordre: integer().notNull().default(0),
    proposeeParIa: boolean("proposee_par_ia").notNull().default(false),
    /** Ligne reprise d'un rapport reçu (rapport de chef) : références des éléments d'origine (« l:… », « r:… »). */
    origines: text().array().notNull().default(sql`'{}'::text[]`),
    /** Qui a écrit les éléments d'origine. */
    auteursOrigine: uuid("auteurs_origine").array().notNull().default(sql`'{}'::uuid[]`),
    /** Visibilité propre (élément reçu à titre privé : « auteur ») ; vide = celle du champ. */
    visibilite: text(),
    /** Le chef fait remonter cet élément dans son propre rapport, en tête. */
    remonte: boolean().notNull().default(false),
    /** Le chef l'a retiré de son rapport (gardé pour ne pas le reprendre une seconde fois). */
    retiree: boolean().notNull().default(false),
    /** Ligne reconduite d'un rapport précédent de la même personne (blocage non résolu, « Reconduire »). */
    repriseDeId: uuid("reprise_de_id").references((): AnyPgColumn => lignesRapport.id, { onDelete: "set null" }),
    /** Première semaine où l'élément est apparu (« 2ᵉ semaine » pour un blocage qui dure). */
    depuisSemaine: date("depuis_semaine"),
    /** Blocage ou décision marqué « Résolu » : il ne revient plus la semaine suivante. */
    resolu: boolean().notNull().default(false),
  },
  (t) => [
    index("lignes_rapport_idx").on(t.rapportId),
    index("lignes_rapport_projet_idx").on(t.projetId),
    // Le brouillon se complète à chaque ouverture : deux ouvertures simultanées n'ajoutent pas deux fois la même ligne.
    uniqueIndex("lignes_rapport_reprise_unique").on(t.rapportId, t.repriseDeId).where(sql`${t.repriseDeId} is not null`),
    uniqueIndex("lignes_rapport_tache_unique").on(t.rapportId, t.champId, t.tacheId).where(sql`${t.tacheId} is not null and not ${t.resolu}`),
  ],
);

/** Réponses autres que des lignes : feux par projet, charge, textes, choix, nombres, dates. */
export const reponsesRapport = pgTable(
  "reponses_rapport",
  {
    id: uuid().primaryKey().defaultRandom(),
    rapportId: uuid("rapport_id")
      .notNull()
      .references(() => rapportsHebdo.id, { onDelete: "cascade" }),
    champId: text("champ_id").notNull(),
    /** Santé : un feu par projet. Vide pour les autres champs. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "cascade" }),
    valeur: text().notNull().default(""),
    commentaire: text().notNull().default(""),
    /** Ce que l'application avait proposé (feu de la semaine dernière, niveau calculé, synthèse). */
    propose: text(),
    /** La proposition vient de l'assistant d'IA (à relire). */
    proposeParIa: boolean("propose_par_ia").notNull().default(false),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reponse_unique").on(t.rapportId, t.champId, sql`coalesce(${t.projetId}, '00000000-0000-0000-0000-000000000000'::uuid)`)],
);

/** État d'un projet à chaque rapport au conseil : donne la « date de fin prévue au dernier rapport ». */
export const historiqueProjet = pgTable(
  "historique_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    mois: date().notNull(),
    dateFinPrevue: date("date_fin_prevue"),
    dateLancementPrevue: date("date_lancement_prevue"),
    etatAvancement: text("etat_avancement").notNull().default(""),
  },
  (t) => [unique("historique_projet_mois").on(t.projetId, t.mois)],
);

/**
 * Chaque changement de la date de fin prévue d'un projet (fiche, barre, correction) : de quoi montrer quand
 * et de combien la fin a glissé. La date de fin initiale reste sur le projet.
 */
export const reportsFinProjet = pgTable(
  "reports_fin_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    avant: date(),
    apres: date(),
    parId: uuid("par_id").references(() => personnes.id, { onDelete: "set null" }),
    /** Pourquoi la fin est repoussée (demandé à chaque report vers une date plus tardive). */
    motif: text().notNull().default(""),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_fin_projet_idx").on(t.projetId, t.creeLe)],
);

/**
 * Registre des décisions d'un projet (décision du 28 octobre 2026) : ce qui a été décidé, quand, par quelle instance
 * (comité de pilotage, direction…), et pourquoi. Noté par l'équipe du projet ou ceux qui le gèrent.
 */
export const decisionsProjet = pgTable(
  "decisions_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    texte: text().notNull(),
    decideeLe: date("decidee_le").notNull(),
    /** Qui a décidé : « Comité de pilotage », « Direction », « Chef de projet »… (texte libre, suggestions). */
    instance: text().notNull().default(""),
    /** Pourquoi, ou ce qui l'a motivée (facultatif). */
    contexte: text().notNull().default(""),
    auteurId: uuid("auteur_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decisions_projet_idx").on(t.projetId, t.decideeLe)],
);

/**
 * Charge prévue, notée une fois par semaine (le lundi, ou au premier passage de la semaine) pour chaque personne
 * de la division : heures de tâches prévues sur les jours ouvrés qui restaient, heures disponibles hors réunions.
 * Elle sert à comparer, après coup, la charge prévue à la charge réalisée.
 */
export const chargesPrevues = pgTable(
  "charges_prevues",
  {
    personneId: uuid("personne_id")
      .notNull()
      .references(() => personnes.id, { onDelete: "cascade" }),
    semaine: date().notNull(),
    heures: real().notNull(),
    capacite: real().notNull(),
    reunions: real().notNull(),
    /** Jours ouvrés comptés : 5 si notée le lundi, moins si elle l'a été plus tard dans la semaine. */
    jours: integer().notNull(),
    noteLe: timestamp("note_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personneId, t.semaine] }), index("charges_prevues_semaine_idx").on(t.semaine)],
);

/**
 * Rapports au conseil : le rapport mensuel (un par mois) et les rapports ponctuels, faits à tout moment
 * pour une demande ou un événement imprévu, au même format.
 */
export const rapportsConseil = pgTable("rapports_conseil", {
  id: uuid().primaryKey().defaultRandom(),
  /** « mensuel » ou « ponctuel ». */
  genre: text().$type<"mensuel" | "ponctuel">().notNull().default("mensuel"),
  /** Rapport mensuel : premier jour du mois couvert. Vide pour un rapport ponctuel. */
  mois: date().unique(),
  /** Rapport ponctuel : son titre, la demande ou l'événement qui le motive, sa date, le début de la période couverte. */
  titre: text().notNull().default(""),
  objet: text().notNull().default(""),
  dateRapport: date("date_rapport"),
  depuis: date(),
  creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
  statut: statutConseil().notNull().default("brouillon"),
  approuveParId: uuid("approuve_par_id").references(() => personnes.id, { onDelete: "set null" }),
  approuveLe: timestamp("approuve_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const lignesConseil = pgTable(
  "lignes_conseil",
  {
    id: uuid().primaryKey().defaultRandom(),
    rapportId: uuid("rapport_id").notNull().references(() => rapportsConseil.id, { onDelete: "cascade" }),
    projetId: uuid("projet_id").notNull().references(() => projets.id),
    ordre: integer().notNull().default(0),
    etatAvancement: text("etat_avancement").notNull().default(""),
    dateFinDernierRapport: date("date_fin_dernier_rapport"),
    nouvelleDateFin: date("nouvelle_date_fin"),
    dateLancement: date("date_lancement"),
    redigeParIa: boolean("redige_par_ia").notNull().default(false),
  },
  (t) => [unique("ligne_conseil_projet").on(t.rapportId, t.projetId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    type: text().notNull(), // relance | blocage | rapport_recu | rapport_pret | rapport_rappel | equipe_retard
    texte: text().notNull(),
    lien: text(),
    lue: boolean().notNull().default(false),
    /** Alerte à n'envoyer qu'une fois (ex. « rapport_pret:2026-10-26 ») ; vide pour les autres. */
    cle: text(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_personne_idx").on(t.personneId, t.lue), uniqueIndex("notifications_cle_idx").on(t.personneId, t.cle)],
);

/** Fichiers joints à un rapport (champ « Pièce jointe »). Lus seulement par qui peut lire ce champ. */
export const piecesJointes = pgTable(
  "pieces_jointes",
  {
    id: uuid().primaryKey().defaultRandom(),
    rapportId: uuid("rapport_id")
      .notNull()
      .references(() => rapportsHebdo.id, { onDelete: "cascade" }),
    champId: text("champ_id").notNull(),
    nom: text().notNull(),
    type: text().notNull(),
    taille: integer().notNull(),
    /** SHA-256 du contenu, en hexadécimal. */
    empreinte: text().notNull(),
    contenu: octets().notNull(),
    deposeParId: uuid("depose_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pieces_jointes_rapport_idx").on(t.rapportId)],
);

/**
 * Documents d'un projet (cahier des charges, spécification, compte rendu…). Lus par qui voit le projet ;
 * déposés par l'équipe du projet et ceux qui le gèrent ; retirés par qui les a déposés ou gère le projet.
 */
export const documentsProjet = pgTable(
  "documents_projet",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id")
      .notNull()
      .references(() => projets.id, { onDelete: "cascade" }),
    /** « cahier_des_charges », « specification », « compte_rendu » ou « autre ». */
    categorie: text().notNull().default("autre"),
    nom: text().notNull(),
    type: text().notNull(),
    taille: integer().notNull(),
    /** SHA-256 du contenu, en hexadécimal. */
    empreinte: text().notNull(),
    contenu: octets().notNull(),
    deposeParId: uuid("depose_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_projet_projet_idx").on(t.projetId, t.creeLe)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Empreinte SHA-256 du jeton : le jeton lui-même n'est jamais stocké. */
    id: text().primaryKey(),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    agent: text(),
    /** Comment la session a été ouverte : « mot_de_passe » ou « google ». */
    methode: text().notNull().default("mot_de_passe"),
  },
  (t) => [index("sessions_personne_idx").on(t.personneId)],
);

/** Journal des actions sensibles (connexions, envois, approbations, changements d'organisation). */
export const journal = pgTable(
  "journal",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    personneId: uuid("personne_id").references(() => personnes.id, { onDelete: "set null" }),
    action: text().notNull(),
    objet: text(),
    details: jsonb(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("journal_date_idx").on(t.creeLe)],
);

/**
 * Courriels envoyés par l'application (rappels du rapport du vendredi) : un seul par personne, par type et
 * par semaine, même si plusieurs serveurs ou redémarrages tentent l'envoi.
 */
export const envoisCourriel = pgTable(
  "envois_courriel",
  {
    id: uuid().primaryKey().defaultRandom(),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    type: text().notNull(),
    semaine: date().notNull(),
    envoyeLe: timestamp("envoye_le", { withTimezone: true }).notNull().defaultNow(),
    /** Vide si l'envoi a réussi ; sinon le message d'erreur du serveur de courriel. */
    erreur: text().notNull().default(""),
  },
  (t) => [unique("envois_courriel_unique").on(t.personneId, t.type, t.semaine)],
);

/**
 * Écrans ouverts, pour le suivi du pilote : une ligne par jour, écran et personne (« a ouvert cet écran ce
 * jour-là »). Ne s'affiche qu'en nombres agrégés (personnes distinctes par écran), jamais par personne.
 */
export const consultations = pgTable(
  "consultations",
  {
    jour: date().notNull(),
    ecran: text().notNull(),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jour, t.ecran, t.personneId] })],
);

export type Personne = typeof personnes.$inferSelect;
export type Equipe = typeof equipes.$inferSelect;
export type Projet = typeof projets.$inferSelect;
export type Tache = typeof taches.$inferSelect;
export type RapportHebdo = typeof rapportsHebdo.$inferSelect;
export type LigneRapport = typeof lignesRapport.$inferSelect;
export type ReponseRapport = typeof reponsesRapport.$inferSelect;
export type ModeleRapport = typeof modelesRapport.$inferSelect;
export type VersionModele = typeof versionsModele.$inferSelect;
export type PieceJointe = typeof piecesJointes.$inferSelect;
export type RapportConseil = typeof rapportsConseil.$inferSelect;
export type Reunion = typeof reunions.$inferSelect;

/**
 * « Annuler » juste après une action faite depuis la barre : ce qu'il faut pour la défaire, gardé côté
 * serveur quelques minutes (la page n'a qu'un identifiant, elle ne peut pas décrire elle-même quoi défaire).
 */
export const annulations = pgTable(
  "annulations",
  {
    id: uuid().primaryKey().defaultRandom(),
    personneId: uuid("personne_id").notNull().references(() => personnes.id, { onDelete: "cascade" }),
    genre: text().notNull(),
    donnees: jsonb().$type<Record<string, unknown>>().notNull(),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    utiliseeLe: timestamp("utilisee_le", { withTimezone: true }),
  },
  (t) => [index("annulations_personne_idx").on(t.personneId, t.creeLe)],
);
