CREATE TABLE "voz_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"comando" text NOT NULL,
	"motivo" text NOT NULL,
	"confianza" double precision,
	"intentos" integer DEFAULT 1 NOT NULL,
	"app_version" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voz_eventos" ADD CONSTRAINT "voz_eventos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voz_eventos" ADD CONSTRAINT "voz_eventos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voz_eventos_puesto_comando_motivo_uk" ON "voz_eventos" USING btree ("puesto_id","comando","motivo");