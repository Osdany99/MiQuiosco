import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableName, is, Table } from 'drizzle-orm'
import * as schema from './schema'

/**
 * Pool de conexiones a PostgreSQL.
 *
 * El pool se reutiliza entre invocaciones del serverless de Nitro para evitar
 * abrir conexiones nuevas en cada request. En desarrollo, el pool se cierra
 * automáticamente cuando el proceso termina.
 */
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL no está definida en las variables de entorno. '
        + 'Revisa tu archivo .env.'
      )
    }
    pool = new Pool({
      connectionString,
      // En serverless (Vercel) cada instancia abre su propio pool:
      // usar PG_POOL_MAX=5 en producción. En local/VPS, 10 está bien.
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000
    })
    pool.on('error', (err) => {
      console.error('[pg pool] Error inesperado en cliente inactivo:', err)
    })
  }
  return pool
}

/**
 * Cliente Drizzle ORM tipado contra el esquema de Postgres.
 * Usar en todos los endpoints server-side para acceder a la base.
 *
 * Es perezoso a propósito: el pool (y el error si falta DATABASE_URL) solo
 * se crea al primer uso, no al importar el módulo. Así el build/prerender
 * en CI —donde no hay .env— no exige una BD viva.
 */
function createDb() {
  return drizzle(getPool(), { schema })
}

type DbClient = ReturnType<typeof createDb>

let lazyDb: DbClient | null = null

function getDb(): DbClient {
  if (!lazyDb) lazyDb = createDb()
  return lazyDb
}

export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop)
  }
}) as DbClient

/**
 * Helper para cerrar el pool en scripts de seed o tests.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/**
 * Mapa de tablas Drizzle indexado por su nombre físico (snake_case).
 *
 * El schema exporta las tablas con nombres JS en camelCase (p.ej. `cuadreItems`),
 * pero los config objects referencian la tabla por su nombre físico
 * (`cuadre_items`). Este mapa permite resolver `schemaByTabla[tabla]` y los
 * `customMutations` (que usan nombres físicos como `historial_precios`) de forma
 * consistente. Se deriva automáticamente, así que añadir una tabla nueva no
 * requiere tocar este archivo.
 */
export const schemaByTabla: Record<string, Table> = {}
for (const value of Object.values(schema)) {
  if (is(value, Table)) {
    schemaByTabla[getTableName(value)] = value
  }
}

export { schema }
