DROP INDEX "voz_eventos_puesto_comando_motivo_uk";--> statement-breakpoint
ALTER TABLE "voz_eventos" ADD COLUMN "plantilla" text;--> statement-breakpoint
ALTER TABLE "voz_eventos" ADD COLUMN "clave_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "voz_eventos_puesto_clave_hash_uk" ON "voz_eventos" USING btree ("puesto_id","clave_hash");