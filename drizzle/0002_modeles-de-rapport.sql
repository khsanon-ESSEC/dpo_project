CREATE TABLE "affectations_modele" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modele_id" uuid NOT NULL,
	"equipe_id" uuid,
	"personne_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affectation_equipe" UNIQUE("equipe_id"),
	CONSTRAINT "affectation_personne" UNIQUE("personne_id")
);
--> statement-breakpoint
CREATE TABLE "modeles_rapport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT 'individuel' NOT NULL,
	"par_defaut" boolean DEFAULT false NOT NULL,
	"pour_chefs" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reponses_rapport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapport_id" uuid NOT NULL,
	"champ_id" text NOT NULL,
	"projet_id" uuid,
	"valeur" text DEFAULT '' NOT NULL,
	"commentaire" text DEFAULT '' NOT NULL,
	"propose" text,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions_modele" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modele_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"champs" jsonb NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"creee_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"publiee_le" timestamp with time zone,
	"publiee_par_id" uuid,
	CONSTRAINT "version_modele_numero" UNIQUE("modele_id","numero")
);
--> statement-breakpoint
ALTER TABLE "lignes_rapport" ALTER COLUMN "partie" SET DATA TYPE text USING "partie"::text;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ALTER COLUMN "partie" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "champ_id" text;--> statement-breakpoint
-- Rapports d'avant les modèles : chaque ligne appartient au champ de sa partie (modèle par défaut).
UPDATE "lignes_rapport" SET "champ_id" = "partie";--> statement-breakpoint
ALTER TABLE "lignes_rapport" ALTER COLUMN "champ_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "origines" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "auteurs_origine" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "visibilite" text;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "remonte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "retiree" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "version_modele_id" uuid;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "formulaire" jsonb;--> statement-breakpoint
ALTER TABLE "affectations_modele" ADD CONSTRAINT "affectations_modele_modele_id_modeles_rapport_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modeles_rapport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations_modele" ADD CONSTRAINT "affectations_modele_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations_modele" ADD CONSTRAINT "affectations_modele_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponses_rapport" ADD CONSTRAINT "reponses_rapport_rapport_id_rapports_hebdo_id_fk" FOREIGN KEY ("rapport_id") REFERENCES "public"."rapports_hebdo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponses_rapport" ADD CONSTRAINT "reponses_rapport_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions_modele" ADD CONSTRAINT "versions_modele_modele_id_modeles_rapport_id_fk" FOREIGN KEY ("modele_id") REFERENCES "public"."modeles_rapport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions_modele" ADD CONSTRAINT "versions_modele_creee_par_id_personnes_id_fk" FOREIGN KEY ("creee_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions_modele" ADD CONSTRAINT "versions_modele_publiee_par_id_personnes_id_fk" FOREIGN KEY ("publiee_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reponse_unique" ON "reponses_rapport" USING btree ("rapport_id","champ_id",coalesce("projet_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD CONSTRAINT "rapports_hebdo_version_modele_id_versions_modele_id_fk" FOREIGN KEY ("version_modele_id") REFERENCES "public"."versions_modele"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."partie_rapport";