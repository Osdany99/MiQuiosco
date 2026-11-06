-- ============================================================================
-- Migración 0024_jazzy_logan (Fase 3: registro central de fallos de sync)
-- ============================================================================
-- Aplicación MANUAL en Neon. Es aditiva: crea una tabla nueva, sin tocar datos
-- existentes. Requiere que la 0023 (dispositivos/accesos) ya esté aplicada,
-- porque `sync_fallos.dispositivo_id` referencia `dispositivos`.
--
-- Incluye la fila de historial en drizzle.__drizzle_migrations para que el job
-- `migrate-db` del próximo release no intente reaplicarla.
--
-- Pegar todo junto en el SQL Editor de Neon.
-- ============================================================================

BEGIN;

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

ALTER TABLE "sync_fallos" ADD CONSTRAINT "sync_fallos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sync_fallos" ADD CONSTRAINT "sync_fallos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "sync_fallos_puesto_clave_uk" ON "sync_fallos" USING btree ("puesto_id","clave_hash");
CREATE INDEX "sync_fallos_puesto_estado_idx" ON "sync_fallos" USING btree ("puesto_id","resuelto_en");
CREATE INDEX "sync_fallos_dispositivo_idx" ON "sync_fallos" USING btree ("dispositivo_id","ultimo_en");
CREATE INDEX "sync_fallos_ultimo_en_idx" ON "sync_fallos" USING btree ("ultimo_en");

-- Registro de la migración (sha256 del .sql, created_at = `when` del journal).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
VALUES ('a75bce6f99f7caa0ebf4fe02aed1883ad936d905feb03e0eb6c54a0aea592df4', 1794000805545);

COMMIT;


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- a) 0024 registrada:
--    SELECT hash, created_at FROM drizzle.__drizzle_migrations
--    ORDER BY created_at DESC LIMIT 2;
--
-- b) Tabla creada:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'sync_fallos';
--
-- c) Tras una sync con rechazos, los fallos agrupados:
--    SELECT tipo, fase, tabla, motivo, codigo_http, intentos,
--           dispositivo, ultimo_en, resuelto_en
--    FROM sync_fallos
--    ORDER BY ultimo_en DESC LIMIT 20;
--
-- d) Pendientes de resolver por puesto:
--    SELECT puesto_id, count(*) AS abiertos
--    FROM sync_fallos WHERE resuelto_en IS NULL
--    GROUP BY puesto_id;
