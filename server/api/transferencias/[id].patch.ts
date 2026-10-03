import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, transferenciaItems, cuadres, productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'
import { validarTopeCuadre } from '../../utils/fiadoTope'
import { updateTransferenciaSchema } from '#shared/schemas/updateTransferencia'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const body = await readBody(event)
  const parsed = updateTransferenciaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const { items } = parsed.data

  // 404 si no existe O si es de otro puesto (misma respuesta).
  const transferencia = await exigirPuesto(auth, 'transferencias', id, 'Transferencia')

  // Precios congelados: los productos que siguen conservan su precio original;
  // los nuevos toman el precio de venta actual.
  const itemsActuales = await db
    .select()
    .from(transferenciaItems)
    .where(eq(transferenciaItems.transferenciaId, id))

  const preciosAnteriores = new Map(itemsActuales.map(i => [i.productoId, i.precioVentaUsado]))
  const productoIdsNuevos = items.filter(i => !preciosAnteriores.has(i.productoId)).map(i => i.productoId)
  const preciosActuales = new Map<string, number>()
  if (productoIdsNuevos.length > 0) {
    const filas = await db
      .select({ id: productos.id, precio: productos.precioVentaActual })
      .from(productos)
      .where(sql`${productos.id} in (${sql.join(productoIdsNuevos.map(p => sql`${p}`), sql`, `)})`)
    for (const f of filas) preciosActuales.set(f.id, Number(f.precio))
  }

  const itemsFinales = items.map((it) => {
    const congelado = preciosAnteriores.get(it.productoId)
    const precio = congelado != null ? congelado : (preciosActuales.get(it.productoId) ?? it.precioVentaUsado)
    return { ...it, precioVentaUsado: precio, subtotal: it.cantidad * precio }
  })

  const nuevoTotal = itemsFinales.reduce((s, it) => s + it.subtotal, 0)
  if (nuevoTotal <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'El monto de la transferencia debe ser mayor que cero.' })
  }

  await validarTopeCuadre(transferencia.cuadreId, items, { excluirTransferenciaIds: [id], concepto: 'transferencia' })

  const delta = nuevoTotal - transferencia.montoTotal

  await db.transaction(async (tx) => {
    await tx.delete(transferenciaItems).where(eq(transferenciaItems.transferenciaId, id))
    for (const it of itemsFinales) {
      await tx.insert(transferenciaItems).values({
        transferenciaId: id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.subtotal
      })
    }

    await tx
      .update(transferencias)
      .set({ montoTotal: nuevoTotal, actualizadoEn: new Date() })
      .where(eq(transferencias.id, id))

    if (delta !== 0) {
      await tx
        .update(cuadres)
        .set({ montoTransferencia: sql`GREATEST(${cuadres.montoTransferencia} + ${delta}, 0)` })
        .where(eq(cuadres.id, transferencia.cuadreId))
    }
  })

  return { id, montoTotal: nuevoTotal }
})
