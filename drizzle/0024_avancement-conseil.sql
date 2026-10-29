CREATE TABLE "avancements_conseil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"mois" date NOT NULL,
	"texte" text NOT NULL,
	"maj_par_id" uuid,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avancement_conseil_projet_mois" UNIQUE("projet_id","mois")
);
--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD COLUMN "source" text DEFAULT 'regles' NOT NULL;--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD COLUMN "source_par_id" uuid;--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD COLUMN "source_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "avancements_conseil" ADD CONSTRAINT "avancements_conseil_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avancements_conseil" ADD CONSTRAINT "avancements_conseil_maj_par_id_personnes_id_fk" FOREIGN KEY ("maj_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_conseil" ADD CONSTRAINT "lignes_conseil_source_par_id_personnes_id_fk" FOREIGN KEY ("source_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "lignes_conseil" SET "source" = 'ia' WHERE "redige_par_ia";--> statement-breakpoint
UPDATE "lignes_conseil" l SET "source" = 'direction', "source_par_id" = j."personne_id", "source_le" = j."cree_le" FROM (SELECT DISTINCT ON ("objet") "objet", "personne_id", "cree_le" FROM "journal" WHERE "action" = 'conseil_etat_modifie' ORDER BY "objet", "cree_le" DESC) j WHERE j."objet" = l."id"::text;
