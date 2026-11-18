CREATE TABLE "voz_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"wake" text DEFAULT 'oye nova' NOT NULL,
	"motor" text DEFAULT 'auto' NOT NULL,
	"idioma" text DEFAULT 'sistema' NOT NULL,
	"retencion_dias" integer DEFAULT 30 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "voz_config" ADD CONSTRAINT "voz_config_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;