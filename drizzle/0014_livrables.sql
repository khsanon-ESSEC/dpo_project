ALTER TYPE "public"."etat_indicateur" ADD VALUE 'pret' BEFORE 'atteint';--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "responsable_id" uuid;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "critere" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "pret_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "valide_par_id" uuid;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "remarque" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "livrable_id" uuid;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_responsable_id_personnes_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_valide_par_id_personnes_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_livrable_id_indicateurs_id_fk" FOREIGN KEY ("livrable_id") REFERENCES "public"."indicateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indicateurs_responsable_idx" ON "indicateurs" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "taches_livrable_idx" ON "taches" USING btree ("livrable_id");