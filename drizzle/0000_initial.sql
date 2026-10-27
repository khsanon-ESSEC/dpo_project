CREATE TYPE "public"."etat_indicateur" AS ENUM('a_venir', 'en_cours', 'atteint');--> statement-breakpoint
CREATE TYPE "public"."partie_rapport" AS ENUM('fait', 'en_cours', 'bloque', 'prochaine');--> statement-breakpoint
CREATE TYPE "public"."sante_projet" AS ENUM('dans_les_temps', 'a_surveiller', 'en_retard');--> statement-breakpoint
CREATE TYPE "public"."statut_conseil" AS ENUM('brouillon', 'approuve', 'envoye');--> statement-breakpoint
CREATE TYPE "public"."statut_projet" AS ENUM('requete', 'en_attente', 'en_cours', 'continu', 'finalise');--> statement-breakpoint
CREATE TYPE "public"."statut_rapport" AS ENUM('brouillon', 'envoye');--> statement-breakpoint
CREATE TYPE "public"."statut_tache" AS ENUM('a_faire', 'en_cours', 'bloquee', 'faite');--> statement-breakpoint
CREATE TABLE "equipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"chef_id" uuid,
	"equipe_parente_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipes_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "evenements_tache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tache_id" uuid NOT NULL,
	"auteur_id" uuid,
	"type" text NOT NULL,
	"avant" text,
	"apres" text,
	"note" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"mois" date NOT NULL,
	"date_fin_prevue" date,
	"date_lancement_prevue" date,
	"etat_avancement" text DEFAULT '' NOT NULL,
	CONSTRAINT "historique_projet_mois" UNIQUE("projet_id","mois")
);
--> statement-breakpoint
CREATE TABLE "indicateurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"ordre" integer NOT NULL,
	"libelle" text NOT NULL,
	"etat" "etat_indicateur" DEFAULT 'a_venir' NOT NULL,
	"atteint_le" date
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"personne_id" uuid,
	"action" text NOT NULL,
	"objet" text,
	"details" jsonb,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lignes_conseil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapport_id" uuid NOT NULL,
	"projet_id" uuid NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"etat_avancement" text DEFAULT '' NOT NULL,
	"date_fin_dernier_rapport" date,
	"nouvelle_date_fin" date,
	"date_lancement" date,
	"redige_par_ia" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ligne_conseil_projet" UNIQUE("rapport_id","projet_id")
);
--> statement-breakpoint
CREATE TABLE "lignes_rapport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapport_id" uuid NOT NULL,
	"partie" "partie_rapport" NOT NULL,
	"texte" text NOT NULL,
	"projet_id" uuid,
	"tache_id" uuid,
	"ordre" integer DEFAULT 0 NOT NULL,
	"proposee_par_ia" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personne_id" uuid NOT NULL,
	"type" text NOT NULL,
	"texte" text NOT NULL,
	"lien" text,
	"lue" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prenom" text NOT NULL,
	"nom" text NOT NULL,
	"courriel" text NOT NULL,
	"poste" text DEFAULT '' NOT NULL,
	"equipe_id" uuid,
	"superieur_id" uuid,
	"directeur" boolean DEFAULT false NOT NULL,
	"executif" boolean DEFAULT false NOT NULL,
	"administrateur" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"mot_de_passe_hash" text,
	"doit_changer_mot_de_passe" boolean DEFAULT true NOT NULL,
	"echecs_connexion" integer DEFAULT 0 NOT NULL,
	"bloque_jusqua" timestamp with time zone,
	"theme" text DEFAULT 'auto' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personnes_courriel_unique" UNIQUE("courriel")
);
--> statement-breakpoint
CREATE TABLE "projets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"titre" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"programme" text DEFAULT '' NOT NULL,
	"strategique" boolean DEFAULT false NOT NULL,
	"statut" "statut_projet" DEFAULT 'en_cours' NOT NULL,
	"sante" "sante_projet" DEFAULT 'dans_les_temps' NOT NULL,
	"chef_projet_id" uuid,
	"date_entree" date,
	"date_fin_initiale" date,
	"date_fin_prevue" date,
	"date_lancement_prevue" date,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rapports_conseil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mois" date NOT NULL,
	"statut" "statut_conseil" DEFAULT 'brouillon' NOT NULL,
	"approuve_par_id" uuid,
	"approuve_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rapports_conseil_mois_unique" UNIQUE("mois")
);
--> statement-breakpoint
CREATE TABLE "rapports_hebdo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auteur_id" uuid NOT NULL,
	"semaine" date NOT NULL,
	"statut" "statut_rapport" DEFAULT 'brouillon' NOT NULL,
	"destinataire_id" uuid,
	"envoye_le" timestamp with time zone,
	"parties_relues" text[] DEFAULT '{}'::text[] NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rapport_auteur_semaine" UNIQUE("auteur_id","semaine")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"personne_id" uuid NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"agent" text
);
--> statement-breakpoint
CREATE TABLE "taches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid,
	"titre" text NOT NULL,
	"assigne_id" uuid NOT NULL,
	"statut" "statut_tache" DEFAULT 'a_faire' NOT NULL,
	"echeance" date,
	"blocage" text,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	"terminee_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_chef_id_personnes_id_fk" FOREIGN KEY ("chef_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_equipe_parente_id_equipes_id_fk" FOREIGN KEY ("equipe_parente_id") REFERENCES "public"."equipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenements_tache" ADD CONSTRAINT "evenements_tache_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenements_tache" ADD CONSTRAINT "evenements_tache_auteur_id_personnes_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_projet" ADD CONSTRAINT "historique_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD CONSTRAINT "lignes_conseil_rapport_id_rapports_conseil_id_fk" FOREIGN KEY ("rapport_id") REFERENCES "public"."rapports_conseil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD CONSTRAINT "lignes_conseil_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD CONSTRAINT "lignes_rapport_rapport_id_rapports_hebdo_id_fk" FOREIGN KEY ("rapport_id") REFERENCES "public"."rapports_hebdo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD CONSTRAINT "lignes_rapport_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD CONSTRAINT "lignes_rapport_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_superieur_id_personnes_id_fk" FOREIGN KEY ("superieur_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_chef_projet_id_personnes_id_fk" FOREIGN KEY ("chef_projet_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD CONSTRAINT "rapports_conseil_approuve_par_id_personnes_id_fk" FOREIGN KEY ("approuve_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD CONSTRAINT "rapports_hebdo_auteur_id_personnes_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."personnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD CONSTRAINT "rapports_hebdo_destinataire_id_personnes_id_fk" FOREIGN KEY ("destinataire_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_assigne_id_personnes_id_fk" FOREIGN KEY ("assigne_id") REFERENCES "public"."personnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evenements_tache_idx" ON "evenements_tache" USING btree ("tache_id","cree_le");--> statement-breakpoint
CREATE INDEX "indicateurs_projet_idx" ON "indicateurs" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "journal_date_idx" ON "journal" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "lignes_rapport_idx" ON "lignes_rapport" USING btree ("rapport_id");--> statement-breakpoint
CREATE INDEX "lignes_rapport_projet_idx" ON "lignes_rapport" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "notifications_personne_idx" ON "notifications" USING btree ("personne_id","lue");--> statement-breakpoint
CREATE INDEX "personnes_superieur_idx" ON "personnes" USING btree ("superieur_id");--> statement-breakpoint
CREATE INDEX "personnes_equipe_idx" ON "personnes" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "rapports_destinataire_idx" ON "rapports_hebdo" USING btree ("destinataire_id");--> statement-breakpoint
CREATE INDEX "sessions_personne_idx" ON "sessions" USING btree ("personne_id");--> statement-breakpoint
CREATE INDEX "taches_assigne_idx" ON "taches" USING btree ("assigne_id");--> statement-breakpoint
CREATE INDEX "taches_projet_idx" ON "taches" USING btree ("projet_id");