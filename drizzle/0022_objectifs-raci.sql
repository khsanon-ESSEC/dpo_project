CREATE TABLE "objectifs_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"genre" text NOT NULL,
	"ordre" integer NOT NULL,
	"libelle" text NOT NULL,
	"indicateur" text DEFAULT '' NOT NULL,
	"depart" text DEFAULT '' NOT NULL,
	"cible" text DEFAULT '' NOT NULL,
	"constate" text DEFAULT '' NOT NULL,
	"constate_le" date,
	"evaluation" text DEFAULT '' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raci" (
	"cle" text PRIMARY KEY NOT NULL,
	"projet_id" uuid,
	"colonnes" jsonb NOT NULL,
	"lignes" jsonb NOT NULL,
	"maj_par_id" uuid,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objectifs_projet" ADD CONSTRAINT "objectifs_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raci" ADD CONSTRAINT "raci_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raci" ADD CONSTRAINT "raci_maj_par_id_personnes_id_fk" FOREIGN KEY ("maj_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objectifs_projet_idx" ON "objectifs_projet" USING btree ("projet_id","genre","ordre");--> statement-breakpoint
-- Le RACI type de la DPO (tableau de la note de cadrage, 29 octobre 2026).
INSERT INTO "raci" ("cle", "colonnes", "lignes") VALUES ('type', '[{"libelle": "Demandeur (Métier)", "qui": "sponsor"}, {"libelle": "Chef de projet (DPO)", "qui": "chef"}, {"libelle": "Équipes DPO (Solutions, Méthodes)", "qui": "equipe"}]'::jsonb, '[{"activite": "Rédiger la note de cadrage", "lettres": ["A", "R", "C"]}, {"activite": "Rédiger le cahier des charges", "lettres": ["A", "R", "C"]}, {"activite": "Valider la solution", "lettres": ["A", "C", "R"]}, {"activite": "Former les utilisateurs", "lettres": ["A", "I", "R"]}, {"activite": "Gérer les demandes d''évolution", "lettres": ["A", "C", "R"]}]'::jsonb) ON CONFLICT DO NOTHING;
