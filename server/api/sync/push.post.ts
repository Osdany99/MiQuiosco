/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, inArray, getTableName, getTableColumns, and, isNull, ne, sql } from 'drizzle-orm'
import { db, schemaByTabla } from '../../database/client'
import { SYNC_TABLES } from '../../config/syncTables'
import { requireAuth } from '../../utils/auth'
import { PADRE_POR_TABLA } from '../../utils/puesto'
import { pushSyncSchema } from '#shared/schemas/pushSync'
import { deletedRecords } from '../../database/schema'
import type { Table, Column } from 'drizzle-orm'

const TABLAS_SYNC_SET = new Set(SYNC_TABLES.map(t => t.tabla))

/**
 * Regla del dominio aplicada en la frontera: un producto tiene UNA sola fila de
 * historial vigente.
 *
 * La aplica shared/mutations/producto.ts, pero el push no ejecuta esa
 * mutación: se limita a escribir lo que le manda el dispositivo. Si un cliente
 * viejo (o uno con el bug de NaN) inserta una fila abierta sin cerrar la
 * anterior, el servidor acabaría con varias vigentes. Aquí se cierra el resto
 * en la misma transacción del push, que es el único sitio donde se puede
 * hacer sin cambiar el esquema de ninguna de las dos bases de datos.
 *
 * `vigente_hasta = greatest(vigente_desde, nuevoDesde - 1)`: con el mínimo
 * intermedio, una fila abierta con fecha futura no quedaría con un rango
 * invertido (desde > hasta).
 */
async function cerrarVigentesPrevias(
  tx: any,
  table: Table,
  tableName: string,
  columns: Record<string, Column>,
  row: any,
  values: Record<string, any>
): Promise<void> {
  if (tableName !== 'historial_precios') return
  if (values.vigenteHasta != null) return
  const productoId = values.productoId
  if (!productoId) return
  const { productoId: colProducto, vigenteDesde: colDesde, vigenteHasta: colHasta, id: colId } = columns
  if (!colProducto || !colDesde || !colHasta || !colId) return

  const nuevoDesdeMs = values.vigenteDesde instanceof Date
    ? values.vigenteDesde.getTime()
    : (Date.parse(String(values.vigenteDesde)) || Date.now())
  const cerradoEn = new Date(Math.max(0, nuevoDesdeMs - 1))

  await tx.update(table)
    .set({
      vigenteHasta: sql`greatest(${colDesde}, ${cerradoEn})`,
      actualizadoEn: new Date()
    })
    .where(and(
      eq(colProducto, productoId),
      isNull(colHasta),
      ne(colId, row.id)
    ))
}

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId

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
  // o no deja estado parcial en el servidor. Las validaciones de puesto van
  // DENTRO de la tx y antes de cada escritura: un 403 aborta todo el push.
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
          // INSERT: la fila debe pertenecer al puesto del JWT.
          if (tableName === 'usuarios' && (row.pinHash == null || row.pinHash === '')) {
            // Fail-fast con 422 en vez del 500 opaco por NOT NULL: el cliente
            // debe mandar pinHash (bcrypt) al crear usuarios desde el
            // dispositivo. Sin esto, un solo usuario nuevo aborta todo el push.
            throw createError({
              statusCode: 422,
              statusMessage: 'Falta pinHash en la fila de usuarios.'
            })
          }
          if (syncConfig.puestoScoped) {
            if (row.puestoId && row.puestoId !== puestoId) {
              throw createError({
                statusCode: 403,
                statusMessage: `La fila ${row.id} de ${tableName} pertenece a otro puesto.`
              })
            }
            // Espejo de crudCreate: si no trae puesto, es del que sincroniza.
            if (!row.puestoId) row.puestoId = puestoId
          } else {
            // Hija sin puestoId propio: el padre debe existir y ser propio.
            // Se lee en la tx para ver tambien padres del mismo push.
            await exigirPadrePropio(tx, syncConfig.tabla, row, puestoId)
          }
          // Coercionado aquí y no en el insert: el guard necesita los valores ya
          // convertidos (el vigenteDesde llega como ISO y la columna es timestamp).
          const valores = coerceRow(row, syncConfig, columns)
          await cerrarVigentesPrevias(tx, table, tableName, columns, row, valores)
          await tx.insert(table).values(valores)
          aceptados.push(row.id)
          continue
        }

        // UPDATE o conflicto: la fila existente debe ser del puesto. Esto
        // tambien cierra el oraculo de la rama de conflicto (antes, pushear un
        // id adivinado devolvia la fila completa del servidor).
        if (syncConfig.puestoScoped) {
          if ((existing as any).puestoId !== puestoId) {
            throw createError({
              statusCode: 403,
              statusMessage: `La fila ${row.id} de ${tableName} pertenece a otro puesto.`
            })
          }
        } else {
          await exigirPadrePropio(tx, syncConfig.tabla, row, puestoId, existing)
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

      const [existing] = await tx.select().from(table).where(eq(columns.id!, del.id)).limit(1)
      if (!existing) {
        // Idempotente: borrar lo que no existe se acepta sin tombstone (no hay
        // nada que propagar a otros dispositivos).
        deletesAceptados.push({ tabla: del.tabla, id: del.id })
        continue
      }

      // Borrar filas ajenas: 403 fail-closed.
      const syncConfig = SYNC_TABLES.find(t => t.tabla === del.tabla)
      if (syncConfig?.puestoScoped) {
        if ((existing as any).puestoId !== puestoId) {
          throw createError({
            statusCode: 403,
            statusMessage: `La fila ${del.id} de ${del.tabla} pertenece a otro puesto.`
          })
        }
      } else if (syncConfig) {
        await exigirPadrePropio(tx, syncConfig.tabla, existing, puestoId, existing)
      }

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

/**
 * Verifica que el padre de una fila hija exista y sea del puesto que
 * sincroniza. Lee en la tx para ver padres del mismo push. 404 si el padre no
 * existe (antes era un 500 opaco por violacion de FK), 403 si es ajeno.
 */
async function exigirPadrePropio(
  tx: any,
  tablaHija: string,
  row: any,
  puestoId: string,
  existing?: any
): Promise<void> {
  const padre = PADRE_POR_TABLA[tablaHija]
  if (!padre) {
    throw createError({
      statusCode: 403,
      statusMessage: `La tabla ${tablaHija} no es sincronizable por este puesto.`
    })
  }
  const fk = row?.[padre.fk] ?? existing?.[padre.fk]
  const parentTable = schemaByTabla[padre.padre] as Table | undefined
  if (!parentTable || fk == null) {
    throw createError({ statusCode: 404, statusMessage: 'Registro padre no encontrado.' })
  }
  const parentCols = getTableColumns(parentTable) as Record<string, Column>
  const [parent] = await tx
    .select()
    .from(parentTable)
    .where(eq(parentCols.id!, fk))
    .limit(1)
  if (!parent) {
    throw createError({ statusCode: 404, statusMessage: 'Registro padre no encontrado.' })
  }
  if ((parent as any).puestoId !== puestoId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El registro padre pertenece a otro puesto.'
    })
  }
}

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
