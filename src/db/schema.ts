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
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const statutTache = pgEnum("statut_tache", ["a_faire", "en_cours", "bloquee", "faite"]);
export const statutProjet = pgEnum("statut_projet", ["requete", "en_attente", "en_cours", "continu", "finalise"]);
export const santeProjet = pgEnum("sante_projet", ["dans_les_temps", "a_surveiller", "en_retard"]);
export const etatIndicateur = pgEnum("etat_indicateur", ["a_venir", "en_cours", "atteint"]);
export const statutRapport = pgEnum("statut_rapport", ["brouillon", "envoye"]);
export const partieRapport = pgEnum("partie_rapport", ["fait", "en_cours", "bloque", "prochaine"]);
export const statutConseil = pgEnum("statut_conseil", ["brouillon", "approuve", "envoye"]);

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
    courriel: text().notNull().unique(),
    poste: text().notNull().default(""),
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
  dateEntree: date("date_entree"),
  dateFinInitiale: date("date_fin_initiale"),
  dateFinPrevue: date("date_fin_prevue"),
  dateLancementPrevue: date("date_lancement_prevue"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

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
    echeance: date(),
    blocage: text(),
    creeParId: uuid("cree_par_id").references(() => personnes.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
  },
  (t) => [index("taches_assigne_idx").on(t.assigneId), index("taches_projet_idx").on(t.projetId)],
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
    partiesRelues: text("parties_relues").array().notNull().default(sql`'{}'::text[]`),
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
    partie: partieRapport().notNull(),
    texte: text().notNull(),
    /** Le chef de ce projet voit cette ligne. Vide = ligne générale, réservée au supérieur. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    tacheId: uuid("tache_id").references(() => taches.id, { onDelete: "set null" }),
    ordre: integer().notNull().default(0),
    proposeeParIa: boolean("proposee_par_ia").notNull().default(false),
  },
  (t) => [index("lignes_rapport_idx").on(t.rapportId), index("lignes_rapport_projet_idx").on(t.projetId)],
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

export const rapportsConseil = pgTable("rapports_conseil", {
  id: uuid().primaryKey().defaultRandom(),
  /** Premier jour du mois couvert. */
  mois: date().notNull().unique(),
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
    type: text().notNull(), // relance | blocage | rapport_recu
    texte: text().notNull(),
    lien: text(),
    lue: boolean().notNull().default(false),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_personne_idx").on(t.personneId, t.lue)],
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
