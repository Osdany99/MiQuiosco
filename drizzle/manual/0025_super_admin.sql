-- ============================================================================
-- Migración 0025_conscious_shape (Fase 4: super admin y API de plataforma)
-- ============================================================================
-- Aplicación MANUAL en Neon. Es aditiva:
--   * enum `rol`  → añade 'super_admin'
--   * `puestos`   → `central`, `permisos` (reservado para la Fase 7)
--   * `usuarios`  → `token_version` (reset de PIN invalida JWT abiertos)
--
-- No requiere migración de SQLite: el APK no usa estas columnas y
-- `pruneToColumns` descarta las que no conoce.
--
-- IMPORTANTE: ejecutar este script ANTES que 0025_bootstrap_admin.sql.
-- `ALTER TYPE ... ADD VALUE` no permite usar el valor nuevo en la misma
-- transacción; el bootstrap va en otra consulta/transacción.
--
-- Pegar todo junto en el SQL Editor de Neon.
-- ============================================================================

BEGIN;

ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE "puestos" ADD COLUMN IF NOT EXISTS "central" boolean DEFAULT false NOT NULL;
ALTER TABLE "puestos" ADD COLUMN IF NOT EXISTS "permisos" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;

-- Registro de la migración (sha256 del .sql, created_at = `when` del journal).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'a8c1a22c358ca933a71ad8ad8e921d58cdf1d769f07b5f51b3111bf577a3736a', 1794001499905
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations"
  WHERE "hash" = 'a8c1a22c358ca933a71ad8ad8e921d58cdf1d769f07b5f51b3111bf577a3736a'
);

COMMIT;


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- a) 0025 registrada:
--    SELECT hash, created_at FROM drizzle.__drizzle_migrations
--    ORDER BY created_at DESC LIMIT 2;
--
-- b) Columnas nuevas:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ( (table_name = 'puestos'  AND column_name IN ('central','permisos'))
--         OR (table_name = 'usuarios' AND column_name = 'token_version') );
--
-- c) Valor del enum:
--    SELECT enumlabel FROM pg_enum e
--    JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'rol' ORDER BY enumsortorder;
--    -- debe incluir super_admin
