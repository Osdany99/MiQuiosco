import { eq, inArray, sql, type Column, type SQL } from 'drizzle-orm'
import { db } from '../database/client'
import {
  cuadreItems,
  cuentasFiado,
  cuentasFiadoItems,
  transferencias,
  transferenciaItems,
  ajustes,
  productos
} from '../database/schema'
import { calcularExcesoTope, sumarPorProducto } from '#shared/fiadoTope'

export interface TopeItem {
  productoId: string
  cantidad: number
}

export interface OpcionesTope {
  /** IDs de cuentas de fiado a excluir (p.ej. la que se está editando). */
  excluirCuentaIds?: string[]
  /** IDs de transferencias a excluir (p.ej. la que se está editando). */
  excluirTransferenciaIds?: string[]
  /** IDs de ajustes a excluir (p.ej. el que se está editando). */
  excluirAjusteIds?: string[]
  /** Nombre humano del concepto que se registra, para el mensaje de error. */
  concepto?: string
}

function queryIn(filtros: string[], columna: Column, cuadreId: string, cuadreCol: Column): SQL {
  return sql`${cuadreCol} = ${cuadreId} and ${columna} not in (${sql.join(filtros.map(id => sql`${id}`), sql`, `)})`
}

/**
 * Consumo actual por producto del cuadre: la suma de todas las unidades ya
 * apartadas por fiado + transferencia + ajustes, con opción de excluir
 * registros concretos (el propio registro en edición).
 */
export async function consumoPorProducto(cuadreId: string, opciones: OpcionesTope = {}) {
  const consumidos = new Map<string, number>()
  const sumar = (filas: Array<{ productoId: string, cantidad: number }>) => {
    for (const f of filas) {
      const actual = consumidos.get(f.productoId) ?? 0
      consumidos.set(f.productoId, actual + (Number(f.cantidad) || 0))
    }
  }

  const [fiado, transferido, ajustado] = await Promise.all([
    db
      .select({
        productoId: cuentasFiadoItems.productoId,
        cantidad: sql<number>`sum(${cuentasFiadoItems.cantidad})`
      })
      .from(cuentasFiadoItems)
      .innerJoin(cuentasFiado, eq(cuentasFiadoItems.cuentaFiadoId, cuentasFiado.id))
      .where(
        (opciones.excluirCuentaIds?.length ?? 0) > 0
          ? queryIn(opciones.excluirCuentaIds!, cuentasFiado.id, cuadreId, cuentasFiado.cuadreOrigenId)
          : eq(cuentasFiado.cuadreOrigenId, cuadreId)
      )
      .groupBy(cuentasFiadoItems.productoId),
    db
      .select({
        productoId: transferenciaItems.productoId,
        cantidad: sql<number>`sum(${transferenciaItems.cantidad})`
      })
      .from(transferenciaItems)
      .innerJoin(transferencias, eq(transferenciaItems.transferenciaId, transferencias.id))
      .where(
        (opciones.excluirTransferenciaIds?.length ?? 0) > 0
          ? queryIn(opciones.excluirTransferenciaIds!, transferencias.id, cuadreId, transferencias.cuadreId)
          : eq(transferencias.cuadreId, cuadreId)
      )
      .groupBy(transferenciaItems.productoId),
    db
      .select({
        productoId: ajustes.productoId,
        cantidad: sql<number>`sum(${ajustes.cantidad})`
      })
      .from(ajustes)
      .where(
        (opciones.excluirAjusteIds?.length ?? 0) > 0
          ? queryIn(opciones.excluirAjusteIds!, ajustes.id, cuadreId, ajustes.cuadreId)
          : eq(ajustes.cuadreId, cuadreId)
      )
      .groupBy(ajustes.productoId)
  ])

  type RenglonConsumo = { productoId: string, cantidad: number }
  const filas = (rows: RenglonConsumo[]) => rows
  sumar(filas(fiado as RenglonConsumo[]))
  sumar(filas(transferido as RenglonConsumo[]))
  sumar(filas(ajustado as RenglonConsumo[]))
  return consumidos
}

/**
 * Valida el tope por producto de un cuadre: lo ya consumido (fiado +
 * transferencia + ajustes, salvo exclusiones) más lo nuevo no puede superar lo
 * vendido de ese producto en el cuadre. Lanza createError 400 si se excede.
 */
export async function validarTopeCuadre(cuadreId: string, items: TopeItem[], opciones: OpcionesTope = {}) {
  const [vendidos, consumidos] = await Promise.all([
    db
      .select({
        productoId: cuadreItems.productoId,
        cantidad: sql<number>`sum(${cuadreItems.cantidad})`
      })
      .from(cuadreItems)
      .where(eq(cuadreItems.cuadreId, cuadreId))
      .groupBy(cuadreItems.productoId),
    consumoPorProducto(cuadreId, opciones)
  ])

  const vendidosMap = new Map(vendidos.map(v => [v.productoId, Number(v.cantidad) || 0]))

  const exceso = calcularExcesoTope(vendidosMap, consumidos, items)
  if (!exceso) return

  const productoIds = [...sumarPorProducto(items).keys()]
  const p = productoIds.length
    ? await db.select({ id: productos.id, nombre: productos.nombre }).from(productos).where(inArray(productos.id, productoIds))
    : []

  const yaConsumido = consumidos.get(exceso.productoId) ?? 0
  const nombre = p.find(x => x.id === exceso.productoId)?.nombre ?? 'este producto'
  const concepto = opciones.concepto ?? 'venta'
  throw createError({
    statusCode: 400,
    statusMessage: `Tope excedido: de ${nombre} solo quedan ${exceso.disponible} unidades disponibles para ${concepto} (vendido ${exceso.disponible + yaConsumido}, incluye fiado/transferencia/ajustes).`
  })
}

/** Compat: validación solo de fiado (mantiene la firma previa). */
export async function validarTopeFiado(cuadreOrigenId: string, items: TopeItem[], excluirCuentaIds: string[] = []) {
  return validarTopeCuadre(cuadreOrigenId, items, { excluirCuentaIds, concepto: 'fiado' })
}

export { cuadres }
