CREATE TABLE "consultations" (
	"jour" date NOT NULL,
	"ecran" text NOT NULL,
	"personne_id" uuid NOT NULL,
	CONSTRAINT "consultations_jour_ecran_personne_id_pk" PRIMARY KEY("jour","ecran","personne_id")
);
--> statement-breakpoint
CREATE TABLE "envois_courriel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personne_id" uuid NOT NULL,
	"type" text NOT NULL,
	"semaine" date NOT NULL,
	"envoye_le" timestamp with time zone DEFAULT now() NOT NULL,
	"erreur" text DEFAULT '' NOT NULL,
	CONSTRAINT "envois_courriel_unique" UNIQUE("personne_id","type","semaine")
);
--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "reunion_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envois_courriel" ADD CONSTRAINT "envois_courriel_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_reunion_id_reunions_id_fk" FOREIGN KEY ("reunion_id") REFERENCES "public"."reunions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taches_reunion_idx" ON "taches" USING btree ("reunion_id");