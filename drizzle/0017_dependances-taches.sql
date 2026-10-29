CREATE TABLE "dependances_tache" (
	"tache_id" uuid NOT NULL,
	"precedente_id" uuid NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dependances_tache_tache_id_precedente_id_pk" PRIMARY KEY("tache_id","precedente_id")
);
--> statement-breakpoint
ALTER TABLE "dependances_tache" ADD CONSTRAINT "dependances_tache_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependances_tache" ADD CONSTRAINT "dependances_tache_precedente_id_taches_id_fk" FOREIGN KEY ("precedente_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependances_tache" ADD CONSTRAINT "dependances_tache_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dependances_precedente_idx" ON "dependances_tache" USING btree ("precedente_id");