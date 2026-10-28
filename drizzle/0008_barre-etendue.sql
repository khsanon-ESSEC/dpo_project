CREATE TABLE "annulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personne_id" uuid NOT NULL,
	"genre" text NOT NULL,
	"donnees" jsonb NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisee_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "prevu_le" date;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "sante_motif" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "sante_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annulations_personne_idx" ON "annulations" USING btree ("personne_id","cree_le");