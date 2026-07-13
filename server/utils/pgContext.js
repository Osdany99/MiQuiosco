/**
 * server/utils/pgContext.js — Capa de bajo nivel sobre Postgres (Drizzle) agnóstica de tabla.
 *
 * Devuelve un objeto con la misma forma que el ctx offline (insert/update/get/queryAll),
 * para que `entity.customMutations` pueda ser compartido entre los dos backends.
 *
 * A diferencia del ctx offline, NO filtra por columnas (Drizzle ya garantiza el shape
 * correcto del INSERT/UPDATE a partir del schema) y devuelve las filas materializadas
 * (con id y timestamps si los define la tabla).
 */
import { eq } from 'drizzle-orm'

/**
 * makePgCtx(db, schema) → { insert, update, get, queryAll, queryWhere }
 *
 * @param {ReturnType<typeof import('../database/client').db>} db
 * @param {Object} schema - módulos de schema Drizzle indexados por nombre lógico:
 *   { productos: productosTable, clientes: clientesTable, ... }
 *   Si una tabla no aparece en `schema`, las operaciones que la usen lanzan.
 * @returns {Object}
 */
export function makePgCtx(db, schema) {
  function tbl(t) {
    const table = schema[t]
    if (!table) throw new Error(`pgContext: tabla "${t}" no está en el schema map`)
    return table
  }

  return {
    /**
     * Inserta una fila. Devuelve la fila materializada (con id generado por la DB).
     * `data` viene en camelCase; Drizzle lo traduce a columnas reales.
     */
    async insert(t, data) {
      const [row] = await db.insert(tbl(t)).values(data).returning()
      return row
    },

    /** Actualiza por id. `cambios` en camelCase. No devuelve nada. */
    async update(t, id, cambios) {
      await db.update(tbl(t)).set(cambios).where(eq(tbl(t).id, id))
    },

    /** Devuelve una fila por id o null. */
    async get(t, id) {
      const [row] = await db.select().from(tbl(t)).where(eq(tbl(t).id, id)).limit(1)
      return row ?? null
    },

    /** Devuelve todas las filas de la tabla. */
    async queryAll(t) {
      return await db.select().from(tbl(t))
    },

    /**
     * Query con WHERE arbitrario. Stub mantenido por simetría con el ctx offline:
     * en Postgres se prefiere componer la query con Drizzle directamente desde
     * el `listFilter` del override.
     * @returns {Promise<Array>}
     */
    async queryWhere(t) {
      return await db.select().from(tbl(t))
    }
  }
}
