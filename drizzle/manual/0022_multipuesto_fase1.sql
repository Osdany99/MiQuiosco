-- ============================================================================
-- Migración 0022_sharp_dracula (Fase 1 multi-puesto) — aplicación MANUAL
-- ============================================================================
-- Este PC no tiene salida a red para `pnpm db:migrate`, así que el bloque se
-- pega en el SQL Editor de Neon.
--
-- Hace exactamente lo mismo que `drizzle-kit migrate` (incluida la fila de
-- historial en drizzle.__drizzle_migrations) MÁS los backfills de datos que
-- Drizzle no puede adivinar. Así un futuro `drizzle-kit migrate` (job
-- `migrate-db` del release) no intentará reaplicar 0022.
--
-- Pegar en DOS pasos: primero el PASO 1; solo si devuelve 0 filas, el PASO 2.
-- ============================================================================


-- ============================================================================
-- PASO 0 — PRE-CHECK (ejecutar solo, leer el resultado, NO continuar a ciegas)
-- ============================================================================
-- Debe devolver 0 filas. Si devuelve filas hay nombres de usuario repetidos
-- (posible si en algún momento se crearon puestos distintos): renómbralos
-- antes de seguir, porque el índice único del PASO 2 fallaría.
SELECT nombre, count(*) AS veces, array_agg(id) AS ids
FROM usuarios
GROUP BY nombre
HAVING count(*) > 1;

-- Opcional: confirmar que existen las filas que se van a rellenar.
SELECT count(*) AS tombstones_sin_puesto FROM deleted_records WHERE puesto_id IS NULL;


-- ============================================================================
-- PASO 2 — MIGRACIÓN + BACKFILL (pegar todo junto)
-- ============================================================================
BEGIN;

-- 1) usuarios.nombre único GLOBAL: el login busca solo por nombre porque el
--    dispositivo no conoce su puesto antes de entrar.
DROP INDEX IF EXISTS "usuarios_puesto_nombre_uk";
DROP INDEX IF EXISTS "usuarios_nombre_uk";
CREATE UNIQUE INDEX "usuarios_nombre_uk" ON "usuarios" USING btree ("nombre");

-- 2) Cliente centinela ("Sin cliente") por puesto, identificado por bandera.
ALTER TABLE "clientes" ADD COLUMN "es_centinela" boolean DEFAULT false NOT NULL;
CREATE INDEX "clientes_centinela_idx" ON "clientes" USING btree ("puesto_id","es_centinela");

-- 3) Tombstones aislados por puesto: sin esto cada dispositivo recibía los
--    borrados de TODOS los puestos.
ALTER TABLE "deleted_records" ADD COLUMN "puesto_id" uuid;
ALTER TABLE "deleted_records" ADD CONSTRAINT "deleted_records_puesto_id_puestos_id_fk"
  FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "deleted_records_puesto_idx" ON "deleted_records" USING btree ("puesto_id","eliminado_en");

-- 4) BACKFILL: el centinela antiguo es el del puesto principal (ID fijo).
UPDATE "clientes"
SET "es_centinela" = true
WHERE "id" = '00000000-0000-0000-0000-000000000003';

--    Todas las filas previas de deleted_records son del único puesto que
--    existía hasta ahora (puesto principal).
UPDATE "deleted_records"
SET "puesto_id" = '00000000-0000-0000-0000-000000000002'
WHERE "puesto_id" IS NULL;

-- 5) Registrar la migración como aplicada, igual que haría Drizzle.
--    hash = sha256 del contenido de drizzle/0022_sharp_dracula.sql (LF)
--    created_at = entrada `when` de drizzle/meta/_journal.json
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
VALUES ('68e6682670a4ccecacac90681c60d4d46d4c74cff3cce4532b213e02b2493089', 1793998239520);

COMMIT;


-- ============================================================================
-- PASO 3 — VERIFICACIÓN (ejecutar solo, después del COMMIT)
-- ============================================================================
-- a) 0022 registrada una sola vez y ninguna migración posterior pendiente:
--    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations
--    ORDER BY created_at DESC LIMIT 3;
--
-- b) Índice único global y ausencia del anterior:
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'usuarios'
--    ORDER BY indexname;
--
-- c) Columnas nuevas:
--    SELECT column_name, data_type, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_name IN ('clientes','deleted_records')
--      AND column_name IN ('es_centinela','puesto_id');
--
-- d) Backfills:
--    SELECT count(*) FROM clientes WHERE es_centinela = true;              -- 1
--    SELECT count(*) FROM deleted_records WHERE puesto_id IS NULL;         -- 0
