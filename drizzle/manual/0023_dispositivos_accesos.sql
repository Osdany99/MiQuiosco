-- ============================================================================
-- Migración 0023_plain_valeria_richards (Fase 2: dispositivos y accesos)
-- ============================================================================
-- Aplicación MANUAL en Neon (este PC no tiene salida a red para
-- `pnpm db:migrate`). Es aditiva: crea un enum y dos tablas nuevas, sin tocar
-- datos existentes.
--
-- Incluye la fila de historial en drizzle.__drizzle_migrations para que el job
-- `migrate-db` del próximo release no intente reaplicarla.
--
-- Pegar todo junto en el SQL Editor de Neon.
-- ============================================================================

BEGIN;

CREATE TYPE "public"."tipo_acceso" AS ENUM('login', 'logout', 'activacion', 'reset_pin');

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

ALTER TABLE "accesos" ADD CONSTRAINT "accesos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "accesos_puesto_idx" ON "accesos" USING btree ("puesto_id","creado_en");
CREATE INDEX "accesos_dispositivo_idx" ON "accesos" USING btree ("dispositivo_id","creado_en");
CREATE INDEX "accesos_usuario_idx" ON "accesos" USING btree ("usuario_id","creado_en");
CREATE INDEX "dispositivos_puesto_idx" ON "dispositivos" USING btree ("puesto_id");
CREATE INDEX "dispositivos_ultima_conexion_idx" ON "dispositivos" USING btree ("ultima_conexion_en");
CREATE INDEX "dispositivos_actualizado_en_idx" ON "dispositivos" USING btree ("actualizado_en");

-- Registro de la migración (hash sha256 del .sql, created_at = `when` del journal).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
VALUES ('2d4ed08f9c534d932185c38d2643fbb858ddb11ac1ac43f23fa672a86b5389e1', 1793999808002);

COMMIT;


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- a) 0023 registrada:
--    SELECT hash, created_at FROM drizzle.__drizzle_migrations
--    ORDER BY created_at DESC LIMIT 2;
--
-- b) Tablas creadas:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('dispositivos','accesos');
--
-- c) Tras el primer login online de la APK nueva:
--    SELECT id, puesto_id, modelo, android, app_version,
--           ultima_conexion_en, ultima_sync_ok_en, pendientes, revocado
--    FROM dispositivos ORDER BY ultima_conexion_en DESC LIMIT 5;
--
--    SELECT tipo, dispositivo_id, usuario_id, ip, creado_en
--    FROM accesos ORDER BY creado_en DESC LIMIT 10;
