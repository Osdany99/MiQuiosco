/**
 * Acceso directo a la BD de pruebas, para los tests que tienen que montar un
 * estado global que la API no permite alcanzar sin auto-invalidarse.
 *
 * Caso concreto: requireAuth relee el usuario de Postgres en cada peticion, asi
 * que si un test suspende a todos los jefes usando el token del jefe del seed,
 * su propio token queda invalido a mitad del test. Por eso la suspension se
 * hace por SQL.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function urlBdPruebas() {
  // El runner (run.mjs) exporta DATABASE_URL apuntando a MiQuiosco_test. Si
  // viene puesta se respeta tal cual; si no, se deriva del .env. Nunca se toca
  // la BD real por accidente: leer el .env a ciegas apuntaria a MiQuiosco, que
  // es la de desarrollo/datos reales.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = {}
  for (const linea of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return (env.DATABASE_URL || '').replace(/\/[^/]+(\?.*)?$/, '/MiQuiosco_test$1')
}

async function conDb(fn) {
  const client = new pg.Client({ connectionString: urlBdPruebas() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Deja a `exceptoId` como unico jefe activo. Devuelve los ids que quedaron
 * suspendidos, para pasarlos despues a restaurarUsuarios().
 */
export async function suspenderJefes(exceptoId) {
  return conDb(async (c) => {
    const { rows } = await c.query(
      `UPDATE usuarios SET activo = false
        WHERE rol = 'jefe' AND activo = true AND id <> $1
        RETURNING id`,
      [exceptoId]
    )
    return rows.map(r => r.id)
  })
}

/** Reactiva los usuarios indicados. */
export async function restaurarUsuarios(ids) {
  if (!ids.length) return
  await conDb(async (c) => {
    await c.query('UPDATE usuarios SET activo = true WHERE id = ANY($1::uuid[])', [ids])
  })
}

/**
 * Devuelve a un usuario a jefe activo. Necesario porque un test que degrada al
 * seed lo deja con rol 'trabajador', y un trabajador no recibe token: sin esto
 * las corridas siguientes fallan con "no autenticado" en cascada.
 */
export async function restaurarJefe(id) {
  await conDb(async (c) => {
    await c.query('UPDATE usuarios SET rol = \'jefe\', activo = true WHERE id = $1', [id])
  })
}

/** Cuantas filas hay de una tabla. Util para verificar efectos de un push. */
export async function contar(tabla) {
  return conDb(async (c) => {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${tabla}"`)
    return rows[0].n
  })
}

/**
 * Crea un puesto de pruebas y devuelve su id. No hay POST /api/puestos
 * (la tabla solo se siembra), asi que los tests multi-puesto lo crean por SQL.
 */
export async function crearPuesto(nombre) {
  return conDb(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO puestos (nombre, activo) VALUES ($1, true) RETURNING id',
      [nombre]
    )
    return rows[0].id
  })
}

/**
 * Crea un usuario con PIN en un puesto dado y devuelve { id, nombre, rol }.
 * El hash se calcula con bcryptjs, la misma libreria del servidor.
 */
export async function crearUsuarioEnPuesto(puestoId, nombre, rol = 'jefe', pin = '1234') {
  const bcrypt = (await import('bcryptjs')).default
  const pinHash = await bcrypt.hash(pin, 10)
  return conDb(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO usuarios (puesto_id, nombre, rol, pin_hash, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nombre, rol`,
      [puestoId, nombre, rol, pinHash]
    )
    return rows[0]
  })
}

/** Filas de una tabla que cumplen una condicion simple. */
export async function filas(tabla, where = 'true') {
  return conDb(async (c) => {
    const { rows } = await c.query(`SELECT * FROM "${tabla}" WHERE ${where}`)
    return rows
  })
}

/**
 * INSERT generico con columnas snake_case y RETURNING id. Para montar fixtures
 * de entidades cuyas rutas transaccionales son complejas (transferencias,
 * cuentas de fiado, pagos...). Las claves van en snake_case tal cual en la BD.
 */
export async function insertar(tabla, fila) {
  const cols = Object.keys(fila)
  const vals = Object.values(fila)
  const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
  return conDb(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO "${tabla}" (${cols.map(x => `"${x}"`).join(', ')}) VALUES (${ph}) RETURNING id`,
      vals
    )
    return rows[0].id
  })
}

/** Borra filas que cumplen una condicion. Para limpiar fixtures propios. */
export async function borrar(tabla, where) {
  return conDb(async (c) => {
    await c.query(`DELETE FROM "${tabla}" WHERE ${where}`)
  })
}
