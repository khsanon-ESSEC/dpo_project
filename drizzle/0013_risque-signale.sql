ALTER TABLE "projets" ADD COLUMN "risque_motif" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "risque_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "risque_par_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_risque_par_id_personnes_id_fk" FOREIGN KEY ("risque_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;