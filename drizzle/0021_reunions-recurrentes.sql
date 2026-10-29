CREATE TABLE "series_reunion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rythme" text NOT NULL,
	"jusquau" date NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reunions" ADD COLUMN "serie_id" uuid;--> statement-breakpoint
ALTER TABLE "series_reunion" ADD CONSTRAINT "series_reunion_cree_par_id_personnes_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunions" ADD CONSTRAINT "reunions_serie_id_series_reunion_id_fk" FOREIGN KEY ("serie_id") REFERENCES "public"."series_reunion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reunions_serie_idx" ON "reunions" USING btree ("serie_id");