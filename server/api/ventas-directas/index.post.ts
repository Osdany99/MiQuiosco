import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  lotes,
  movimientosInventario,
  productos,
  ventasDirectas,
  ventasDirectasItems
} from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { ventaDirectaSchema } from '#shared/schemas/directas'
import { construirVentaDirecta, generarId, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento, comoVentaDirecta } from '../../utils/inventario'

/**
 * Venta directa: efectivo cobrado por el jefe fuera de un cuadre (quiosco
 * cerrado, cliente que llega a la casa). No toca ninguna gaveta ni el corte del
 * día; el efectivo se queda en el bolsillo de quien cobra. El producto sí sale
 * del inventario por FIFO desde la ubicación elegida, y el costo/ganancia
 * quedan congelados en el momento de la venta.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = ventaDirectaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const prods = await db.select().from(productos).where(inArray(productos.id, ids))
  const porId = new Map(prods.map(p => [p.id, p]))
  for (const id of ids) {
    const p = porId.get(id)
    if (!p || p.puestoId !== puestoId) {
      throw createError({ statusCode: 400, statusMessage: 'Hay productos que no pertenecen a este puesto.' })
    }
  }

  const resultado = await db.transaction(async (tx) => {
    const ventaId = generarId()
    const [filasLotes, movs] = await Promise.all([
      tx.select().from(lotes).where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false))),
      tx
        .select()
        .from(movimientosInventario)
        .where(
          and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false))
        )
    ])
    const lotesPorProducto = new Map(
      ids.map(pid => [pid, lotesConSaldo(filasLotes, movs, pid, datos.ubicacion)])
    )

    const venta = comoVentaDirecta(construirVentaDirecta({
      lineas: datos.lineas,
      lotesPorProducto,
      ubicacion: datos.ubicacion,
      ventaId,
      meta: { puestoId, usuarioId, ahora: ahoraMs }
    }))

    // Si la ubicación elegida no alcanza, se avisa antes de escribir nada: es
    // preferible a dejar una venta registrada que no se pudo servir.
    if (venta.faltantes.length > 0) {
      const nombres = venta.faltantes
        .map(f => porId.get(f.productoId)?.nombre ?? f.productoId)
        .join(', ')
      const detalle = venta.faltantes.map(f => `${f.faltante}`).join(', ')
      throw createError({
        statusCode: 400,
        statusMessage: `No hay stock suficiente en ${datos.ubicacion} para: ${nombres} (faltan ${detalle}).`
      })
    }

    const [ventaRow] = await tx
      .insert(ventasDirectas)
      .values({
        id: ventaId,
        puestoId,
        ubicacionVenta: datos.ubicacion,
        montoTotal: venta.montoTotal,
        costoTotal: venta.costoTotal,
        ganancia: venta.ganancia,
        notas: datos.notas ?? null,
        usuarioId,
        anulado: false
      })
      .returning()
    const vd = ventaRow!

    for (const it of venta.items) {
      await tx.insert(ventasDirectasItems).values({
        id: it.id,
        ventaDirectaId: vd.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.subtotal,
        costoUnitario: it.costoUnitario,
        costoTotal: it.costoTotal,
        secuencia: it.secuencia
      })
    }
    for (const m of venta.movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }

    return { id: vd.id, ...venta }
  })

  return {
    id: resultado.id,
    ubicacion: datos.ubicacion,
    montoTotal: resultado.montoTotal,
    costoTotal: resultado.costoTotal,
    ganancia: resultado.ganancia,
    lineas: resultado.items.length,
    movimientos: resultado.movimientos.length
  }
})
