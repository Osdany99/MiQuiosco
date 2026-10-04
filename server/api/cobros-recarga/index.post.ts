import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cobrosRecarga, recargas } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { createCobroRecargaSchema } from '#shared/schemas/cobroRecarga'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createCobroRecargaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { recargaId, monto, formaPago } = parsed.data

  const r = await db.transaction(async (tx) => {
    const [recarga] = await tx
      .select()
      .from(recargas)
      .where(eq(recargas.id, recargaId))
    if (!recarga) {
      throw createError({ statusCode: 404, statusMessage: 'Recarga no encontrada.' })
    }
    if (monto > recarga.montoNominal - recarga.montoCobrado) {
      throw createError({ statusCode: 400, statusMessage: 'El cobro supera el saldo pendiente.' })
    }

    const [cobro] = await tx
      .insert(cobrosRecarga)
      .values({ recargaId, monto, formaPago })
      .returning()
    const cobrado = recarga.montoCobrado + monto

    const [act] = await tx
      .update(recargas)
      .set({
        montoCobrado: cobrado,
        estadoPago: cobrado >= recarga.montoNominal ? 'pagada' : recarga.estadoPago,
        actualizadoEn: new Date()
      })
      .where(eq(recargas.id, recargaId))
      .returning()

    return { cobro: cobro!, recarga: act! }
  })

  return {
    id: r.cobro.id,
    recargaId: r.cobro.recargaId,
    monto: r.cobro.monto,
    formaPago: r.cobro.formaPago,
    creadoEn: r.cobro.creadoEn.toISOString(),
    montoCobrado: r.recarga.montoCobrado,
    estadoPago: r.recarga.estadoPago
  }
})
