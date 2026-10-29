CREATE TABLE "charges_prevues" (
	"personne_id" uuid NOT NULL,
	"semaine" date NOT NULL,
	"heures" real NOT NULL,
	"capacite" real NOT NULL,
	"reunions" real NOT NULL,
	"jours" integer NOT NULL,
	"note_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_prevues_personne_id_semaine_pk" PRIMARY KEY("personne_id","semaine")
);
--> statement-breakpoint
ALTER TABLE "charges_prevues" ADD CONSTRAINT "charges_prevues_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_prevues_semaine_idx" ON "charges_prevues" USING btree ("semaine");