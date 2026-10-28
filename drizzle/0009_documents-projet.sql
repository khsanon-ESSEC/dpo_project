CREATE TABLE "documents_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"categorie" text DEFAULT 'autre' NOT NULL,
	"nom" text NOT NULL,
	"type" text NOT NULL,
	"taille" integer NOT NULL,
	"empreinte" text NOT NULL,
	"contenu" "bytea" NOT NULL,
	"depose_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents_projet" ADD CONSTRAINT "documents_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_projet" ADD CONSTRAINT "documents_projet_depose_par_id_personnes_id_fk" FOREIGN KEY ("depose_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_projet_projet_idx" ON "documents_projet" USING btree ("projet_id","cree_le");