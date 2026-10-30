CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personne_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"motif" text DEFAULT 'conge' NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personnes" ADD COLUMN "courriel_lundi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personnes" ADD COLUMN "accueil_ferme_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absences_personne_idx" ON "absences" USING btree ("personne_id","fin");