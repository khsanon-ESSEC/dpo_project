CREATE TABLE "phases_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"ordre" integer NOT NULL,
	"nom" text NOT NULL,
	"debut" date,
	"fin" date,
	"terminee_le" date
);
--> statement-breakpoint
CREATE TABLE "risques_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"probabilite" integer DEFAULT 2 NOT NULL,
	"impact" integer DEFAULT 2 NOT NULL,
	"responsable_id" uuid,
	"reponse" text DEFAULT '' NOT NULL,
	"statut" text DEFAULT 'ouvert' NOT NULL,
	"revue_le" date,
	"auteur_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temps_passe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tache_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"jour" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"note_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indicateurs" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "phases_projet" ADD CONSTRAINT "phases_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risques_projet" ADD CONSTRAINT "risques_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risques_projet" ADD CONSTRAINT "risques_projet_responsable_id_personnes_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risques_projet" ADD CONSTRAINT "risques_projet_auteur_id_personnes_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temps_passe" ADD CONSTRAINT "temps_passe_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temps_passe" ADD CONSTRAINT "temps_passe_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temps_passe" ADD CONSTRAINT "temps_passe_note_par_id_personnes_id_fk" FOREIGN KEY ("note_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phases_projet_idx" ON "phases_projet" USING btree ("projet_id","ordre");--> statement-breakpoint
CREATE INDEX "risques_projet_idx" ON "risques_projet" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "temps_passe_tache_idx" ON "temps_passe" USING btree ("tache_id");--> statement-breakpoint
CREATE INDEX "temps_passe_personne_idx" ON "temps_passe" USING btree ("personne_id","jour");--> statement-breakpoint
ALTER TABLE "indicateurs" ADD CONSTRAINT "indicateurs_phase_id_phases_projet_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases_projet"("id") ON DELETE set null ON UPDATE no action;