import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { createPagoFiadoSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createPagoFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { cuentaFiadoId, cuadreId, monto, formaPago } = parsed.data

  const [cuenta] = await db
    .select()
    .from(cuentasFiado)
    .where(eq(cuentasFiado.id, cuentaFiadoId))
    .limit(1)

  if (!cuenta) {
    throw createError({ statusCode: 404, statusMessage: 'Cuenta de fiado no encontrada.' })
  }

  const saldoPendiente = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
  if (monto > saldoPendiente) {
    throw createError({ statusCode: 400, statusMessage: `El monto excede el saldo pendiente (${saldoPendiente}).` })
  }

  const result = await db.transaction(async (tx) => {
    const [pago] = await tx
      .insert(pagosFiado)
      .values({ cuentaFiadoId, cuadreId, monto: String(monto), formaPago })
      .returning()
    const p = pago!

    const nuevoPagado = Number(cuenta.montoPagado) + monto
    await tx
      .update(cuentasFiado)
      .set({
        montoPagado: String(nuevoPagado),
        estado: nuevoPagado >= Number(cuenta.montoTotal) ? 'pagada' : 'parcial',
        actualizadoEn: new Date()
      })
      .where(eq(cuentasFiado.id, cuentaFiadoId))

    await tx
      .update(cuadres)
      .set({ montoCobradoFiado: sql`${cuadres.montoCobradoFiado} + ${String(monto)}` })
      .where(eq(cuadres.id, cuadreId))

    return p
  })

  const r = result!
  return {
    id: r.id,
    cuentaFiadoId: r.cuentaFiadoId,
    cuadreId: r.cuadreId,
    monto: Number(r.monto),
    formaPago: r.formaPago,
    creadoEn: r.creadoEn.toISOString()
  }
})
