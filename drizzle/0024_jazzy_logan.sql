CREATE TABLE "sync_fallos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"clave_hash" text NOT NULL,
	"tipo" text NOT NULL,
	"fase" text,
	"tabla" text,
	"registro_id" text,
	"lote_id" text,
	"codigo_http" integer,
	"motivo" text,
	"mensaje" text,
	"fila" jsonb,
	"contexto" jsonb,
	"app_version" text,
	"dispositivo" text,
	"intentos" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"resuelto_por" uuid,
	"nota" text
);
--> statement-breakpoint
ALTER TABLE "sync_fallos" ADD CONSTRAINT "sync_fallos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_fallos" ADD CONSTRAINT "sync_fallos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_fallos_puesto_clave_uk" ON "sync_fallos" USING btree ("puesto_id","clave_hash");--> statement-breakpoint
CREATE INDEX "sync_fallos_puesto_estado_idx" ON "sync_fallos" USING btree ("puesto_id","resuelto_en");--> statement-breakpoint
CREATE INDEX "sync_fallos_dispositivo_idx" ON "sync_fallos" USING btree ("dispositivo_id","ultimo_en");--> statement-breakpoint
CREATE INDEX "sync_fallos_ultimo_en_idx" ON "sync_fallos" USING btree ("ultimo_en");