/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, inArray, getTableName, getTableColumns } from 'drizzle-orm'
import { db, schemaByTabla } from '../../database/client'
import { SYNC_TABLES } from '../../config/syncTables'
import { requireAuth } from '../../utils/auth'
import { pushSyncSchema } from '#shared/schemas/pushSync'
import { deletedRecords } from '../../database/schema'
import type { Table, Column } from 'drizzle-orm'

const TABLAS_SYNC_SET = new Set(SYNC_TABLES.map(t => t.tabla))

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
  const deletes = (data.deletes ?? []) as { tabla: string, id: string }[]
  const aceptados: string[] = []
  const deletesAceptados: { tabla: string, id: string }[] = []
  const conflictos: Record<string, any[]> = {}

  // Todo el push se aplica en una única transacción: o se completa entero,
  // o no deja estado parcial en el servidor.
  await db.transaction(async (tx) => {
    for (const syncConfig of SYNC_TABLES) {
      const table = schemaByTabla[syncConfig.tabla] as Table | undefined
      if (!table) continue

      const tableName = getTableName(table)
      const columns = getTableColumns(table) as Record<string, Column>
      const rows = data[tableName] ?? []
      if (!rows.length) continue

      // Un solo SELECT por tabla (evita N+1 por fila)
      const ids = rows.map((r: any) => r.id).filter((id: any) => typeof id === 'string' && id)
      const existingRows = ids.length
        ? await tx.select().from(table).where(inArray(columns.id!, ids))
        : []
      const existingById = new Map(existingRows.map(r => [(r as any).id, r]))

      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id) continue

        const clientTs = row.actualizadoEn
          ? new Date(row.actualizadoEn).getTime()
          : row.creadoEn
            ? new Date(row.creadoEn).getTime()
            : 0

        const existing = existingById.get(row.id)

        if (!existing) {
          await tx.insert(table).values(coerceRow(row, syncConfig, columns))
          aceptados.push(row.id)
          continue
        }

        if (syncConfig.insertOnly) {
          // Tablas inmutables: la versión del servidor es autoritativa.
          // Se reporta como conflicto para que el cliente absorba la versión del servidor.
          registrarConflicto(conflictos, tableName, existing, row, syncConfig)
          continue
        }

        const serverTs = (existing as any)?.actualizadoEn ? new Date((existing as any).actualizadoEn).getTime() : 0
        if (clientTs > serverTs) {
          await tx.update(table).set(coerceRow(row, syncConfig, columns)).where(eq(columns.id!, row.id))
          aceptados.push(row.id)
        } else {
          registrarConflicto(conflictos, tableName, existing, row, syncConfig)
        }
      }
    }

    for (const del of deletes) {
      // Solo se aceptan deletes de tablas sincronizables.
      if (!TABLAS_SYNC_SET.has(del.tabla)) continue
      const table = schemaByTabla[del.tabla] as Table | undefined
      if (!table) continue
      const columns = getTableColumns(table) as Record<string, Column>
      if (!columns.id) continue

      await tx.delete(table).where(eq(columns.id!, del.id))
      await tx.insert(deletedRecords).values({
        tabla: del.tabla,
        registroId: del.id
      })
      deletesAceptados.push({ tabla: del.tabla, id: del.id })
    }
  })

  return { aceptados, conflictos, deletesAceptados }
})

function registrarConflicto(
  conflictos: Record<string, any[]>,
  tableName: string,
  serverRow: any,
  clientRow: any,
  syncConfig: { syncNumeric: string[] }
) {
  if (!conflictos[tableName]) conflictos[tableName] = []
  conflictos[tableName].push({
    server: serializeRow(serverRow, syncConfig),
    client: serializeRow(clientRow, syncConfig)
  })
}

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
    // Whitelist: solo se escriben columnas reales de la tabla.
    if (!(key in columns)) continue
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
