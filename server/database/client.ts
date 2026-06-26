import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
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
      max: 10,
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
 */
export const db = drizzle(getPool(), { schema })

/**
 * Helper para cerrar el pool en scripts de seed o tests.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export { schema }
