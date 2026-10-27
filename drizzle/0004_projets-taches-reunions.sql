ALTER TYPE "public"."statut_projet" ADD VALUE 'refuse';--> statement-breakpoint
CREATE TABLE "membres_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"ajoute_par_id" uuid,
	"ajoute_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membre_projet_unique" UNIQUE("projet_id","personne_id")
);
--> statement-breakpoint
CREATE TABLE "participants_reunion" (
	"reunion_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	CONSTRAINT "participants_reunion_reunion_id_personne_id_pk" PRIMARY KEY("reunion_id","personne_id")
);
--> statement-breakpoint
CREATE TABLE "reunions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titre" text NOT NULL,
	"jour" date NOT NULL,
	"heure" text,
	"duree_minutes" integer NOT NULL,
	"projet_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"notee_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "demande_par_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "demande_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "justification" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "decision_par_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "decision_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "motif_decision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "archive_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "archive_par_id" uuid;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "annulee_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "annulee_par_id" uuid;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "motif_annulation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_ajoute_par_id_personnes_id_fk" FOREIGN KEY ("ajoute_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants_reunion" ADD CONSTRAINT "participants_reunion_reunion_id_reunions_id_fk" FOREIGN KEY ("reunion_id") REFERENCES "public"."reunions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants_reunion" ADD CONSTRAINT "participants_reunion_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunions" ADD CONSTRAINT "reunions_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunions" ADD CONSTRAINT "reunions_notee_par_id_personnes_id_fk" FOREIGN KEY ("notee_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membres_projet_personne_idx" ON "membres_projet" USING btree ("personne_id");--> statement-breakpoint
CREATE INDEX "participants_personne_idx" ON "participants_reunion" USING btree ("personne_id");--> statement-breakpoint
CREATE INDEX "reunions_jour_idx" ON "reunions" USING btree ("jour");--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_demande_par_id_personnes_id_fk" FOREIGN KEY ("demande_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_decision_par_id_personnes_id_fk" FOREIGN KEY ("decision_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_archive_par_id_personnes_id_fk" FOREIGN KEY ("archive_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_annulee_par_id_personnes_id_fk" FOREIGN KEY ("annulee_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Équipe projet de départ : les personnes qui ont déjà des tâches sur chaque projet (sauf son chef).
INSERT INTO "membres_projet" ("projet_id", "personne_id")
  SELECT DISTINCT t."projet_id", t."assigne_id" FROM "taches" t JOIN "projets" p ON p."id" = t."projet_id"
  WHERE p."chef_projet_id" IS DISTINCT FROM t."assigne_id"
ON CONFLICT DO NOTHING;
