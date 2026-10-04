/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, gt, inArray, getTableName, getTableColumns } from 'drizzle-orm'
import { db, schemaByTabla } from '../../database/client'
import { SYNC_TABLES } from '../../config/syncTables'
import { requireAuth } from '../../utils/auth'
import { PADRE_POR_TABLA } from '../../utils/puesto'
import { deletedRecords } from '../../database/schema'
import type { Table, Column } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId

  const query = getQuery(event)
  const desdeRaw = query.desde
  const desdeMs = typeof desdeRaw === 'string' ? Number(desdeRaw) : 0
  const desde = new Date(isNaN(desdeMs) ? 0 : desdeMs)

  let maxTimestamp = desde.getTime()

  const queries = SYNC_TABLES.map(async (syncConfig) => {
    const table = schemaByTabla[syncConfig.tabla] as Table | undefined
    if (!table) return { tabla: syncConfig.tabla, rows: [] as any[] }

    const tableName = getTableName(table)
    const columns = getTableColumns(table) as Record<string, Column>

    const filterCol = syncConfig.insertOnly ? columns.creadoEn : columns.actualizadoEn
    if (!filterCol) return { tabla: tableName, rows: [] }

    // Aislamiento por puesto: cada terminal solo descarga lo suyo. Las hijas
    // sin puestoId se filtran por el puesto del padre (subquery, sin roundtrip
    // extra). Sin esto, un JWT cualquiera descargaba todos los puestos.
    const conditions = [gt(filterCol, desde)]
    if (syncConfig.puestoScoped) {
      if (!columns.puestoId) return { tabla: tableName, rows: [] }
      conditions.push(eq(columns.puestoId, puestoId))
    } else {
      const padre = PADRE_POR_TABLA[syncConfig.tabla]
      if (!padre) return { tabla: tableName, rows: [] }
      const parentTable = schemaByTabla[padre.padre] as Table | undefined
      const fkCol = (columns as any)[padre.fk]
      if (!parentTable || !fkCol) return { tabla: tableName, rows: [] }
      const parentCols = getTableColumns(parentTable) as Record<string, Column>
      if (!parentCols.puestoId || !parentCols.id) return { tabla: tableName, rows: [] }
      conditions.push(
        inArray(
          fkCol as any,
          db
            .select({ id: parentCols.id as any })
            .from(parentTable as any)
            .where(eq(parentCols.puestoId as any, puestoId))
        )
      )
    }

    const rows = await db.select().from(table).where(and(...conditions))

    for (const row of rows) {
      const ts = (row as any).actualizadoEn ?? (row as any).creadoEn
      if (ts) {
        const ms = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
        if (ms > maxTimestamp) maxTimestamp = ms
      }
    }

    return {
      tabla: tableName,
      rows: rows.map(r => serializeRow(r, syncConfig))
    }
  })

  const deletes = await db
    .select({ tabla: deletedRecords.tabla, id: deletedRecords.registroId, eliminadoEn: deletedRecords.eliminadoEn })
    .from(deletedRecords)
    .where(gt(deletedRecords.eliminadoEn, desde))

  for (const del of deletes) {
    if (del.eliminadoEn) {
      const ms = del.eliminadoEn instanceof Date ? del.eliminadoEn.getTime() : new Date(del.eliminadoEn).getTime()
      if (ms > maxTimestamp) maxTimestamp = ms
    }
  }

  const results = await Promise.all(queries)
  const payload = Object.fromEntries(results.map(r => [r.tabla, r.rows]))

  return { ...payload, deletes, timestamp_servidor: maxTimestamp }
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
