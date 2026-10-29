ALTER TABLE "projets" ADD COLUMN "cadrage" jsonb;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "kit_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "kit_par_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_kit_par_id_personnes_id_fk" FOREIGN KEY ("kit_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "projets" SET "kit_le" = "cree_le" WHERE "statut"::text NOT IN ('requete', 'refuse');
