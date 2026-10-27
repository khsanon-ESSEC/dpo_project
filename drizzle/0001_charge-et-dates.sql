ALTER TABLE "personnes" ADD COLUMN "capacite_heures" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "debut" date;--> statement-breakpoint
ALTER TABLE "taches" ADD COLUMN "estimation_heures" integer;