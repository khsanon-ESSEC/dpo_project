CREATE TABLE "reports_fin_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"avant" date,
	"apres" date,
	"par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports_fin_projet" ADD CONSTRAINT "reports_fin_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_fin_projet" ADD CONSTRAINT "reports_fin_projet_par_id_personnes_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_fin_projet_idx" ON "reports_fin_projet" USING btree ("projet_id","cree_le");