CREATE TABLE "taches_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid,
	"livrable_id" uuid,
	"titre" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assigne_id" uuid NOT NULL,
	"estimation_heures" integer,
	"priorite" text DEFAULT 'normale' NOT NULL,
	"frequence" text NOT NULL,
	"jour" integer NOT NULL,
	"prochaine_le" date NOT NULL,
	"arretee_le" timestamp with time zone,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "sponsor_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "priorite" text DEFAULT 'normale' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "budget_prevu" bigint;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "budget_engage" bigint;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "budget_devise" text DEFAULT 'HTG' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "budget_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "budget_maj_le" date;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "cloture_le" date;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "cloture_par_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "bilan_cloture" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "objectifs_atteints" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "lecons_apprises" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "priorite" text DEFAULT 'normale' NOT NULL;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "recurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "taches_recurrentes" ADD CONSTRAINT "taches_recurrentes_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_recurrentes" ADD CONSTRAINT "taches_recurrentes_livrable_id_indicateurs_id_fk" FOREIGN KEY ("livrable_id") REFERENCES "public"."indicateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_recurrentes" ADD CONSTRAINT "taches_recurrentes_assigne_id_personnes_id_fk" FOREIGN KEY ("assigne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_recurrentes" ADD CONSTRAINT "taches_recurrentes_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taches_recurrentes_prochaine_idx" ON "taches_recurrentes" USING btree ("prochaine_le");--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_sponsor_id_personnes_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_cloture_par_id_personnes_id_fk" FOREIGN KEY ("cloture_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_recurrence_id_taches_recurrentes_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."taches_recurrentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taches_recurrence_idx" ON "taches" USING btree ("recurrence_id");