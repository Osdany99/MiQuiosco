/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray, sql, getTableColumns, type Column } from 'drizzle-orm'
import { db, schemaByTabla } from '../database/client'
import { TABLES } from '#shared/tables'
import type { AuthContext } from './auth'

/**
 * server/utils/puesto.ts — Aislamiento por puesto (multi-terminal).
 *
 * Cada puesto (terminal/quiosco) solo puede ver y tocar sus propias filas.
 * Las tablas con `puestoScoped: true` en shared/tables.js llevan `puestoId`
 * propio; las tablas hijas (lineas, pagos, cobros...) no lo llevan y heredan
 * el puesto de su padre via PADRE_POR_TABLA.
 *
 * Dos respuestas 404 identicas (no existe / es de otro puesto) para no
 * revelar por oraculo que ids existen en otros puestos.
 */

interface Padre {
  padre: string
  fk: string
}

export const PADRE_POR_TABLA: Record<string, Padre> = {
  cuadre_items: { padre: 'cuadres', fk: 'cuadreId' },
  cuentas_fiado_items: { padre: 'cuentas_fiado', fk: 'cuentaFiadoId' },
  pagos_fiado: { padre: 'cuentas_fiado', fk: 'cuentaFiadoId' },
  transferencia_items: { padre: 'transferencias', fk: 'transferenciaId' },
  historial_precios: { padre: 'productos', fk: 'productoId' },
  ventas_directas_items: { padre: 'ventas_directas', fk: 'ventaDirectaId' },
  cobros_recarga: { padre: 'recargas', fk: 'recargaId' }
}

/** Puesto del usuario autenticado, o 403 si no tiene (fail-closed). */
export function puestoDe(auth: AuthContext): string {
  const puestoId = auth?.usuario?.puestoId
  if (!puestoId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Sin puesto asignado. Pide al jefe que te asigne un puesto.'
    })
  }
  return puestoId
}

/**
 * Verifica que la fila `id` de `tabla` pertenezca al puesto del usuario.
 * Devuelve la fila para no leerla dos veces. Lanza 404 si no existe O si es
 * de otro puesto (misma respuesta en ambos casos).
 */
export async function exigirPuesto(
  auth: AuthContext,
  tabla: string,
  id: string,
  label = 'Registro'
): Promise<any> {
  const puestoId = puestoDe(auth)

  const table: any = (schemaByTabla as any)[tabla]
  if (!table) throw new Error(`Tabla "${tabla}" no encontrada en schema`)
  const columns = getTableColumns(table) as Record<string, any>

  const [row] = await db.select().from(table).where(eq(columns.id, id)).limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: `${label} no encontrado.` })
  }

  const config = (TABLES as any)[tabla]
  if (config?.puestoScoped) {
    if ((row as any).puestoId !== puestoId) {
      throw createError({ statusCode: 404, statusMessage: `${label} no encontrado.` })
    }
    return row
  }

  const padre = PADRE_POR_TABLA[tabla]
  if (!padre) {
    throw new Error(
      `Tabla "${tabla}" sin puestoId ni padre configurado en PADRE_POR_TABLA`
    )
  }

  const parentTable: any = (schemaByTabla as any)[padre.padre]
  if (!parentTable) throw new Error(`Tabla padre "${padre.padre}" no encontrada en schema`)
  const parentCols = getTableColumns(parentTable) as Record<string, any>
  const [parent] = await db
    .select()
    .from(parentTable)
    .where(eq(parentCols.id, (row as any)[padre.fk]))
    .limit(1)
  if (!parent || (parent as any).puestoId !== puestoId) {
    throw createError({ statusCode: 404, statusMessage: `${label} no encontrado.` })
  }
  return row
}

/**
 * IDs de las filas de `tablaPadre` que pertenecen al puesto. Para filtrar
 * listados de tablas hijas (que no llevan puestoId) por el puesto del padre.
 */
export async function idsDelPuesto(tablaPadre: string, puestoId: string): Promise<string[]> {
  const parentTable: any = (schemaByTabla as any)[tablaPadre]
  if (!parentTable) throw new Error(`Tabla padre "${tablaPadre}" no encontrada en schema`)
  const parentCols = getTableColumns(parentTable) as Record<string, any>
  const rows = await db
    .select({ id: parentCols.id })
    .from(parentTable)
    .where(eq(parentCols.puestoId, puestoId))
  return rows.map((r: any) => r.id)
}

/**
 * Condicion para listados de tablas hijas: solo filas cuyo padre es del puesto.
 * Si se filtra por un padre concreto ajeno, la composicion (eq + inArray de
 * propios) da lista vacia de forma natural, sin oraculo ni query extra.
 */
export async function condicionHijosDelPuesto(
  auth: AuthContext,
  tablaHija: string,
  columnaFk: Column | undefined,
  idPadreFiltro?: string
): Promise<any> {
  const padre = PADRE_POR_TABLA[tablaHija]
  if (!padre) {
    throw new Error(`Tabla "${tablaHija}" sin padre configurado en PADRE_POR_TABLA`)
  }
  if (!columnaFk) {
    throw new Error(`Columna FK no encontrada para la tabla hija "${tablaHija}"`)
  }
  const conds: any[] = []
  if (idPadreFiltro) conds.push(eq(columnaFk as any, idPadreFiltro))
  const ids = await idsDelPuesto(padre.padre, puestoDe(auth))
  conds.push(ids.length ? inArray(columnaFk as any, ids) : sql`false`)
  return and(...conds)
}
