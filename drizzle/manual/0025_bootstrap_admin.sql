-- ============================================================================
-- Bootstrap del super admin (Fase 4) — ejecutar UNA sola vez
-- ============================================================================
-- Requiere que 0025_super_admin.sql ya esté aplicado y confirmado (el enum
-- `rol` debe aceptar 'super_admin'). Va en su propia transacción por eso.
--
-- Crea (o reutiliza) el puesto central y el usuario `superadmin` con el PIN
-- temporal 123456. CÁMBIALO en cuanto entres:
--
--   POST /api/admin/usuarios/<usuario_id>/reset-pin
--   Authorization: Bearer <token del login>
--   { "pin": "tu-pin-nuevo" }
--
-- (El panel /admin también lo permite: Puestos → icono de llave del jefe.)
--
-- Si quieres otro PIN desde el principio, genera el hash en tu máquina y
-- sustituye el valor de `pin_hash`:
--
--   node --input-type=module -e "import b from 'bcryptjs'; console.log(b.hashSync('123456',10))"
--
-- Pegar todo junto en el SQL Editor de Neon.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_puesto_id uuid;
BEGIN
  -- 1. Puesto central: el primero marcado como tal; si no hay, se crea.
  SELECT id INTO v_puesto_id
  FROM puestos
  WHERE central = true
  ORDER BY creado_en
  LIMIT 1;

  IF v_puesto_id IS NULL THEN
    INSERT INTO puestos (id, nombre, activo, central)
    VALUES ('00000000-0000-4000-8000-0000000000c1', 'Central', true, true)
    ON CONFLICT (id) DO UPDATE SET central = true
    RETURNING id INTO v_puesto_id;
  END IF;

  -- 2. Super admin. El nombre es único global: si ya existe, no se toca.
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre = 'superadmin') THEN
    INSERT INTO usuarios (puesto_id, nombre, rol, pin_hash, activo)
    VALUES (
      v_puesto_id,
      'superadmin',
      'super_admin',
      '$2b$10$cbEmwvEgfYVxLYSzpcvzM.plzXV5RZOF5uugfHLA.W32Hzf5nskua',
      true
    );
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT u.id AS usuario_id,
       u.nombre,
       u.rol,
       u.activo,
       p.id AS puesto_id,
       p.nombre AS puesto,
       p.central
FROM usuarios u
JOIN puestos p ON p.id = u.puesto_id
WHERE u.nombre = 'superadmin';

-- Login de prueba (con curl desde tu máquina):
--   curl -s -X POST https://<tu-dominio>/api/auth/login \
--     -H "Content-Type: application/json" \
--     -d "{\"nombre_usuario\":\"superadmin\",\"pin\":\"123456\"}"
--
-- El token devuelto sirve para /api/admin/* (el super admin NO entra al APK).
