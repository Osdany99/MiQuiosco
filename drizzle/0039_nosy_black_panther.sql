CREATE TABLE "voz_config_dispositivo" (
	"dispositivo_id" uuid PRIMARY KEY NOT NULL,
	"motor" text,
	"idioma" text,
	"wake" text,
	"version" integer DEFAULT 1 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "dispositivos" ADD COLUMN "voz_motor" text;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD COLUMN "voz_vosk" boolean;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD COLUMN "voz_stt" boolean;--> statement-breakpoint
ALTER TABLE "voz_config_dispositivo" ADD CONSTRAINT "voz_config_dispositivo_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voz_config_dispositivo" ADD CONSTRAINT "voz_config_dispositivo_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;