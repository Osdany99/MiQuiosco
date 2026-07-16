/* eslint-disable @typescript-eslint/no-explicit-any */
import { gt, getTableName, getTableColumns } from 'drizzle-orm'
import { db, schemaByTabla } from '../../database/client'
import { SYNC_TABLES } from '../../config/syncTables'
import { requireAuth } from '../../utils/auth'
import type { Table, Column } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'sync')

  const query = getQuery(event)
  const desdeRaw = query.desde
  const desdeMs = typeof desdeRaw === 'string' ? Number(desdeRaw) : 0
  const desde = new Date(isNaN(desdeMs) ? 0 : desdeMs)

  const queries = SYNC_TABLES.map(async (syncConfig) => {
    const table = schemaByTabla[syncConfig.tabla] as Table | undefined
    if (!table) return { tabla: syncConfig.tabla, rows: [] as any[] }

    const tableName = getTableName(table)
    const columns = getTableColumns(table) as Record<string, Column>

    const filterCol = syncConfig.insertOnly ? columns.creadoEn! : columns.actualizadoEn!
    const rows = await db.select().from(table).where(gt(filterCol, desde))

    return {
      tabla: tableName,
      rows: rows.map(r => serializeRow(r, syncConfig))
    }
  })

  const results = await Promise.all(queries)
  const payload = Object.fromEntries(results.map(r => [r.tabla, r.rows]))

  return { ...payload, timestamp_servidor: Date.now() }
})

function serializeRow(row: Record<string, any>, syncConfig: { syncNumeric: string[] }): Record<string, any> {
  const out: Record<string, any> = {}
  const numericSet = new Set(syncConfig.syncNumeric)

  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      out[key] = null
    } else if (numericSet.has(key)) {
      out[key] = Number(value)
    } else if (value instanceof Date) {
      out[key] = value.toISOString()
    } else {
      out[key] = value
    }
  }
  return out
}
