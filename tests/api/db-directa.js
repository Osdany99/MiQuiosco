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

/** Filas de una tabla que cumplen una condicion simple. */
export async function filas(tabla, where = 'true') {
  return conDb(async (c) => {
    const { rows } = await c.query(`SELECT * FROM "${tabla}" WHERE ${where}`)
    return rows
  })
}
