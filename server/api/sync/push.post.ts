/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, getTableName, getTableColumns } from 'drizzle-orm'
import { db, schemaByTabla } from '../../database/client'
import { SYNC_TABLES } from '../../config/syncTables'
import { requireAuth } from '../../utils/auth'
import { pushSyncSchema } from '#shared/schemas/pushSync'
import { deletedRecords } from '../../database/schema'
import type { Table, Column } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'sync')

  const body = await readBody(event)
  const parsed = pushSyncSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const data = parsed.data as Record<string, any>
  const deletes = (data.deletes ?? []) as { tabla: string; id: string }[]
  const aceptados: string[] = []
  const deletesAceptados: { tabla: string; id: string }[] = []
  const conflictos: Record<string, any[]> = {}

  for (const syncConfig of SYNC_TABLES) {
    const table = schemaByTabla[syncConfig.tabla] as Table | undefined
    if (!table) continue

    const tableName = getTableName(table)
    const columns = getTableColumns(table) as Record<string, Column>
    const rows = data[tableName] ?? []

    for (const row of rows) {
      const clientTs = row.actualizadoEn
        ? new Date(row.actualizadoEn).getTime()
        : row.creadoEn
          ? new Date(row.creadoEn).getTime()
          : 0

      if (syncConfig.insertOnly) {
        const existing = await db.select().from(table).where(eq(columns.id!, row.id)).limit(1)
        if (existing.length === 0) {
          const values = coerceRow(row, syncConfig, columns)
          await db.insert(table).values(values)
        }
        aceptados.push(row.id)
        continue
      }

      const existing = await db.select().from(table).where(eq(columns.id!, row.id)).limit(1)

      if (existing.length === 0) {
        const values = coerceRow(row, syncConfig, columns)
        await db.insert(table).values(values)
        aceptados.push(row.id)
      } else {
        const serverTs = (existing[0] as any)?.actualizadoEn ? new Date((existing[0] as any).actualizadoEn).getTime() : 0
        if (clientTs > serverTs) {
          const updates = coerceRow(row, syncConfig, columns)
          await db.update(table).set(updates).where(eq(columns.id!, row.id))
          aceptados.push(row.id)
        } else {
          if (!conflictos[tableName]) conflictos[tableName] = []
          conflictos[tableName].push({
            server: serializeRow(existing[0], syncConfig),
            client: serializeRow(row, syncConfig)
          })
        }
      }
    }
  }

  for (const del of deletes) {
    const table = schemaByTabla[del.tabla] as Table | undefined
    if (!table) continue
    const columns = getTableColumns(table) as Record<string, Column>
    if (!columns.id) continue

    await db.delete(table).where(eq(columns.id!, del.id))
    await db.insert(deletedRecords).values({
      tabla: del.tabla,
      registroId: del.id
    })
    deletesAceptados.push({ tabla: del.tabla, id: del.id })
  }

  return { aceptados, conflictos, deletesAceptados }
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

function coerceRow(row: Record<string, any>, syncConfig: { syncNumeric: string[] }, columns: Record<string, Column>): Record<string, any> {
  const out: Record<string, any> = {}
  const numericSet = new Set(syncConfig.syncNumeric)

  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      out[key] = null
      continue
    }
    if (numericSet.has(key)) {
      out[key] = String(value)
    } else if ((typeof value === 'string' || typeof value === 'number') && columns[key]?.getSQLType()?.includes('timestamp')) {
      const d = new Date(value)
      out[key] = isNaN(d.getTime()) ? value : d
    } else {
      out[key] = value
    }
  }
  return out
}
