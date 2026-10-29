CREATE TABLE "listes_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genre" text NOT NULL,
	"libelle" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listes_projet" ADD CONSTRAINT "listes_projet_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listes_projet_libelle_idx" ON "listes_projet" USING btree ("genre",lower("libelle"));--> statement-breakpoint
INSERT INTO "listes_projet" ("genre", "libelle")
SELECT DISTINCT ON (lower(btrim("programme"))) 'programme', btrim("programme") FROM "projets" WHERE btrim("programme") <> '' ORDER BY lower(btrim("programme")), btrim("programme")
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "listes_projet" ("genre", "libelle")
SELECT DISTINCT ON (lower(btrim("division"))) 'division', btrim("division") FROM "projets" WHERE btrim("division") <> '' ORDER BY lower(btrim("division")), btrim("division")
ON CONFLICT DO NOTHING;
