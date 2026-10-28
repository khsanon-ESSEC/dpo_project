ALTER TABLE "personnes" ALTER COLUMN "courriel" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personnes" ADD COLUMN "externe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personnes" ADD COLUMN "organisation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "division" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projets" ADD COLUMN "referent_id" uuid;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_referent_id_personnes_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;