CREATE TABLE "pieces_jointes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapport_id" uuid NOT NULL,
	"champ_id" text NOT NULL,
	"nom" text NOT NULL,
	"type" text NOT NULL,
	"taille" integer NOT NULL,
	"empreinte" text NOT NULL,
	"contenu" "bytea" NOT NULL,
	"depose_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rapports_conseil" ALTER COLUMN "mois" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "modeles_rapport" ADD COLUMN "horaires" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "cle" text;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "genre" text DEFAULT 'mensuel' NOT NULL;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "titre" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "objet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "date_rapport" date;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "depuis" date;--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD COLUMN "cree_par_id" uuid;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "complete_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "ecartees" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reponses_rapport" ADD COLUMN "propose_par_ia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_rapport_id_rapports_hebdo_id_fk" FOREIGN KEY ("rapport_id") REFERENCES "public"."rapports_hebdo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_depose_par_id_personnes_id_fk" FOREIGN KEY ("depose_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pieces_jointes_rapport_idx" ON "pieces_jointes" USING btree ("rapport_id");--> statement-breakpoint
ALTER TABLE "rapports_conseil" ADD CONSTRAINT "rapports_conseil_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_cle_idx" ON "notifications" USING btree ("personne_id","cle");