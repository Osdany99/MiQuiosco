CREATE TYPE "public"."tipo_acceso" AS ENUM('login', 'logout', 'activacion', 'reset_pin');--> statement-breakpoint
CREATE TABLE "accesos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"usuario_id" uuid,
	"tipo" "tipo_acceso" NOT NULL,
	"app_version" text,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"puesto_id" uuid NOT NULL,
	"nombre" text,
	"modelo" text,
	"android" text,
	"app_version" text,
	"ultima_conexion_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_sync_ok_en" timestamp with time zone,
	"pendientes" integer DEFAULT 0 NOT NULL,
	"revocado" boolean DEFAULT false NOT NULL,
	"provisionado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accesos_puesto_idx" ON "accesos" USING btree ("puesto_id","creado_en");--> statement-breakpoint
CREATE INDEX "accesos_dispositivo_idx" ON "accesos" USING btree ("dispositivo_id","creado_en");--> statement-breakpoint
CREATE INDEX "accesos_usuario_idx" ON "accesos" USING btree ("usuario_id","creado_en");--> statement-breakpoint
CREATE INDEX "dispositivos_puesto_idx" ON "dispositivos" USING btree ("puesto_id");--> statement-breakpoint
CREATE INDEX "dispositivos_ultima_conexion_idx" ON "dispositivos" USING btree ("ultima_conexion_en");--> statement-breakpoint
CREATE INDEX "dispositivos_actualizado_en_idx" ON "dispositivos" USING btree ("actualizado_en");