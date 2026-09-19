import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../database/client'
import { cuadres, cuadreItems, cuentasFiado, cuentasFiadoItems, productos } from '../database/schema'
import { calcularExcesoTope, sumarPorProducto } from '#shared/fiadoTope'

export interface TopeItem {
  productoId: string
  cantidad: number
}

/**
 * Valida el tope de fiado de un cuadre: lo ya fiado por producto (todas las
 * cuentas del cuadre, salvo las excluidas) más lo nuevo no puede superar lo
 * vendido de ese producto en el cuadre. Lanza createError 400 si se excede.
 */
export async function validarTopeFiado(cuadreOrigenId: string, items: TopeItem[], excluirCuentaIds: string[] = []) {
  const [vendidos, fiados] = await Promise.all([
    db
      .select({
        productoId: cuadreItems.productoId,
        cantidad: sql<number>`sum(${cuadreItems.cantidad})`
      })
      .from(cuadreItems)
      .where(eq(cuadreItems.cuadreId, cuadreOrigenId))
      .groupBy(cuadreItems.productoId),
    db
      .select({
        productoId: cuentasFiadoItems.productoId,
        cantidad: sql<number>`sum(${cuentasFiadoItems.cantidad})`
      })
      .from(cuentasFiadoItems)
      .innerJoin(cuentasFiado, eq(cuentasFiadoItems.cuentaFiadoId, cuentasFiado.id))
      .where(
        excluirCuentaIds.length > 0
          ? sql`${cuentasFiado.cuadreOrigenId} = ${cuadreOrigenId} and ${cuentasFiado.id} not in (${sql.join(excluirCuentaIds.map(id => sql`${id}`), sql`, `)})`
          : eq(cuentasFiado.cuadreOrigenId, cuadreOrigenId)
      )
      .groupBy(cuentasFiadoItems.productoId)
  ])

  const vendidosMap = new Map(vendidos.map(v => [v.productoId, Number(v.cantidad) || 0]))
  const fiadosMap = new Map(fiados.map(f => [f.productoId, Number(f.cantidad) || 0]))

  const exceso = calcularExcesoTope(vendidosMap, fiadosMap, items)
  if (!exceso) return

  const productoIds = [...sumarPorProducto(items).keys()]
  const p = productoIds.length
    ? await db.select({ id: productos.id, nombre: productos.nombre }).from(productos).where(inArray(productos.id, productoIds))
    : []

  const nombre = p.find(x => x.id === exceso.productoId)?.nombre ?? 'este producto'
  throw createError({
    statusCode: 400,
    statusMessage: `Tope de fiado excedido: de ${nombre} solo quedan ${exceso.disponible} unidades disponibles (vendido ${exceso.disponible + (fiadosMap.get(exceso.productoId) ?? 0)}).`
  })
}

export { cuadres }
