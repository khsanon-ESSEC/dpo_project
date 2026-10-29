CREATE TABLE "decisions_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"texte" text NOT NULL,
	"decidee_le" date NOT NULL,
	"instance" text DEFAULT '' NOT NULL,
	"contexte" text DEFAULT '' NOT NULL,
	"auteur_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decisions_projet" ADD CONSTRAINT "decisions_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions_projet" ADD CONSTRAINT "decisions_projet_auteur_id_personnes_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decisions_projet_idx" ON "decisions_projet" USING btree ("projet_id","decidee_le");