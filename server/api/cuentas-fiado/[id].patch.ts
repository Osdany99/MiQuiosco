import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, cuadres, productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { validarTopeFiado } from '../../utils/fiadoTope'
import { updateCuentaFiadoSchema } from '#shared/schemas/updateCuentaFiado'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const body = await readBody(event)
  const parsed = updateCuentaFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const { items } = parsed.data

  const [cuenta] = await db
    .select()
    .from(cuentasFiado)
    .where(eq(cuentasFiado.id, id))
    .limit(1)

  if (!cuenta) {
    throw createError({ statusCode: 404, statusMessage: 'Cuenta de fiado no encontrada.' })
  }
  if (cuenta.estado === 'pagada') {
    throw createError({ statusCode: 400, statusMessage: 'La cuenta ya está pagada y no se puede editar.' })
  }

  // Precios congelados: los productos que siguen en la cuenta conservan su
  // precio original; productos nuevos toman el precio de venta actual.
  const itemsActuales = await db
    .select()
    .from(cuentasFiadoItems)
    .where(eq(cuentasFiadoItems.cuentaFiadoId, id))

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
  if (nuevoTotal < cuenta.montoPagado) {
    throw createError({
      statusCode: 400,
      statusMessage: `El nuevo total (${nuevoTotal}) no puede ser menor a lo ya pagado (${cuenta.montoPagado}).`
    })
  }

  const pendienteAnterior = cuenta.montoTotal - cuenta.montoPagado
  const pendienteNuevo = nuevoTotal - cuenta.montoPagado

  await validarTopeFiado(cuenta.cuadreOrigenId, items, [id])

  await db.transaction(async (tx) => {
    await tx.delete(cuentasFiadoItems).where(eq(cuentasFiadoItems.cuentaFiadoId, id))
    for (const it of itemsFinales) {
      await tx.insert(cuentasFiadoItems).values({
        cuentaFiadoId: id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.subtotal
      })
    }

    await tx
      .update(cuentasFiado)
      .set({
        montoTotal: nuevoTotal,
        estado: cuenta.montoPagado >= nuevoTotal ? 'pagada' : cuenta.montoPagado > 0 ? 'parcial' : 'pendiente',
        actualizadoEn: new Date()
      })
      .where(eq(cuentasFiado.id, id))

    // Ajustar el fiado pendiente del cuadre de origen en el delta (piso 0).
    const delta = pendienteNuevo - pendienteAnterior
    if (delta !== 0) {
      await tx
        .update(cuadres)
        .set({ montoFiado: sql`GREATEST(${cuadres.montoFiado} + ${delta}, 0)` })
        .where(eq(cuadres.id, cuenta.cuadreOrigenId))
    }
  })

  return { id, montoTotal: nuevoTotal, estado: cuenta.montoPagado >= nuevoTotal ? 'pagada' : cuenta.montoPagado > 0 ? 'parcial' : 'pendiente' }
})
