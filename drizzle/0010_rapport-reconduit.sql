CREATE TABLE "messages_rapport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rapport_id" uuid NOT NULL,
	"auteur_id" uuid NOT NULL,
	"texte" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "reprise_de_id" uuid;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "depuis_semaine" date;--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD COLUMN "resolu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "lu_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD COLUMN "lu_par" uuid;--> statement-breakpoint
ALTER TABLE "messages_rapport" ADD CONSTRAINT "messages_rapport_rapport_id_rapports_hebdo_id_fk" FOREIGN KEY ("rapport_id") REFERENCES "public"."rapports_hebdo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages_rapport" ADD CONSTRAINT "messages_rapport_auteur_id_personnes_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."personnes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_rapport_idx" ON "messages_rapport" USING btree ("rapport_id","cree_le");--> statement-breakpoint
ALTER TABLE "lignes_rapport" ADD CONSTRAINT "lignes_rapport_reprise_de_id_lignes_rapport_id_fk" FOREIGN KEY ("reprise_de_id") REFERENCES "public"."lignes_rapport"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapports_hebdo" ADD CONSTRAINT "rapports_hebdo_lu_par_personnes_id_fk" FOREIGN KEY ("lu_par") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lignes_rapport_reprise_unique" ON "lignes_rapport" USING btree ("rapport_id","reprise_de_id") WHERE "lignes_rapport"."reprise_de_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "lignes_rapport_tache_unique" ON "lignes_rapport" USING btree ("rapport_id","champ_id","tache_id") WHERE "lignes_rapport"."tache_id" is not null and not "lignes_rapport"."resolu";