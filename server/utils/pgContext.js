import { eq, getTableName, getTableColumns } from 'drizzle-orm'

/**
 * makePgCtx(db, schema) → { insert, update, get, queryAll }
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

  const tsKeyCache = new Map()

  function esTimestamp(col) {
    const sqlType = col?.getSQLType?.() || ''
    return sqlType.includes('timestamp')
  }

  function getTableNameOrFallback(table) {
    try {
      return getTableName(table)
    } catch {
      return ''
    }
  }

  function getTimestampKeys(table) {
    let columns
    try {
      columns = getTableColumns(table)
    } catch {
      columns = null
    }
    if (!columns) {
      console.warn('[pgContext] getTableColumns sin columns:', table?.constructor?.name)
      return new Set()
    }
    const key = getTableNameOrFallback(table)
    if (key && tsKeyCache.has(key)) return tsKeyCache.get(key)
    const keys = new Set()
    for (const [name, col] of Object.entries(columns)) {
      if (esTimestamp(col)) keys.add(name)
    }
    if (key) tsKeyCache.set(key, keys)
    return keys
  }

  function coerceTimestamps(table, data) {
    const tsKeys = getTimestampKeys(table)
    if (tsKeys.size === 0) return data
    const out = { ...data }
    for (const key of tsKeys) {
      const v = out[key]
      if (v == null) continue
      if (typeof v === 'number') out[key] = new Date(v)
      else if (typeof v === 'string') out[key] = new Date(v)
    }
    return out
  }

  return {
    async insert(t, data) {
      const [row] = await db.insert(tbl(t)).values(coerceTimestamps(tbl(t), data)).returning()
      return row
    },

    async update(t, id, cambios) {
      await db.update(tbl(t)).set(coerceTimestamps(tbl(t), cambios)).where(eq(tbl(t).id, id))
    },

    async get(t, id) {
      const [row] = await db.select().from(tbl(t)).where(eq(tbl(t).id, id)).limit(1)
      return row ?? null
    },

    async queryAll(t) {
      return await db.select().from(tbl(t))
    }
  }
}
