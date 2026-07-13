import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { createCuentaFiadoSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createCuentaFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { clienteId, cuadreOrigenId, items, montoPagadoInicial = 0, formaPagoInicial = 'efectivo' } = parsed.data
  const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)

  if (montoPagadoInicial > montoTotal) {
    throw createError({ statusCode: 400, statusMessage: 'El pago inicial no puede superar el monto total.' })
  }

  const result = await db.transaction(async (tx) => {
    const [cuenta] = await tx
      .insert(cuentasFiado)
      .values({
        puestoId: auth.usuario.puestoId,
        clienteId,
        cuadreOrigenId,
        montoTotal: String(montoTotal),
        montoPagado: String(montoPagadoInicial),
        estado: !montoPagadoInicial ? 'pendiente' : montoPagadoInicial >= montoTotal ? 'pagada' : 'parcial'
      })
      .returning()
    const c = cuenta!

    for (const it of items) {
      await tx.insert(cuentasFiadoItems).values({
        cuentaFiadoId: c.id,
        productoId: it.productoId,
        cantidad: String(it.cantidad),
        precioVentaUsado: String(it.precioVentaUsado),
        subtotal: String(it.cantidad * it.precioVentaUsado)
      })
    }

    if (montoPagadoInicial > 0) {
      await tx.insert(pagosFiado).values({
        cuentaFiadoId: c.id,
        cuadreId: cuadreOrigenId,
        monto: String(montoPagadoInicial),
        formaPago: formaPagoInicial
      })
      await tx
        .update(cuadres)
        .set({ montoCobradoFiado: sql`${cuadres.montoCobradoFiado} + ${String(montoPagadoInicial)}` })
        .where(eq(cuadres.id, cuadreOrigenId))
    }

    return c
  })

  const r = result!
  return {
    id: r.id,
    clienteId: r.clienteId,
    cuadreOrigenId: r.cuadreOrigenId,
    montoTotal: Number(r.montoTotal),
    montoPagado: Number(r.montoPagado),
    estado: r.estado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
})
