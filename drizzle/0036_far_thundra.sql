ALTER TABLE "voz_config" ADD COLUMN "capturar_texto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voz_eventos" ADD COLUMN "texto" text;