CREATE TABLE "constats_benefice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objectif_id" uuid NOT NULL,
	"valeur" text NOT NULL,
	"le" date NOT NULL,
	"par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "constat_benefice_jour" UNIQUE("objectif_id","le")
);
--> statement-breakpoint
ALTER TABLE "constats_benefice" ADD CONSTRAINT "constats_benefice_objectif_id_objectifs_projet_id_fk" FOREIGN KEY ("objectif_id") REFERENCES "public"."objectifs_projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constats_benefice" ADD CONSTRAINT "constats_benefice_par_id_personnes_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "constats_benefice" ("objectif_id", "valeur", "le") SELECT "id", "constate", COALESCE("constate_le", "maj_le"::date) FROM "objectifs_projet" WHERE "genre" = 'benefice' AND "constate" <> '' ON CONFLICT DO NOTHING;
