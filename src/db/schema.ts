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
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
export const etatIndicateur = pgEnum("etat_indicateur", ["a_venir", "en_cours", "atteint"]);
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
  sante: santeProjet().notNull().default("dans_les_temps"),
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
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

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

export const indicateurs = pgTable(
  "indicateurs",
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid("projet_id").notNull().references(() => projets.id, { onDelete: "cascade" }),
    ordre: integer().notNull(),
    libelle: text().notNull(),
    etat: etatIndicateur().notNull().default("a_venir"),
    atteintLe: date("atteint_le"),
  },
  (t) => [index("indicateurs_projet_idx").on(t.projetId)],
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
  },
  (t) => [index("taches_assigne_idx").on(t.assigneId), index("taches_projet_idx").on(t.projetId)],
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
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reunions_jour_idx").on(t.jour)],
);

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
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("rapport_auteur_semaine").on(t.auteurId, t.semaine), index("rapports_destinataire_idx").on(t.destinataireId)],
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
  },
  (t) => [index("lignes_rapport_idx").on(t.rapportId), index("lignes_rapport_projet_idx").on(t.projetId)],
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
