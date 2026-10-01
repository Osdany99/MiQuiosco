import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const [cuenta] = await db
    .select()
    .from(cuentasFiado)
    .where(eq(cuentasFiado.id, id))
    .limit(1)

  if (!cuenta) {
    throw createError({ statusCode: 404, statusMessage: 'Cuenta de fiado no encontrada.' })
  }

  const pagos = await db.select().from(pagosFiado).where(eq(pagosFiado.cuentaFiadoId, id))
  const pendiente = cuenta.montoTotal - cuenta.montoPagado

  await db.transaction(async (tx) => {
    // Revertir en cascada: los pagos quitaban del montoCobradoFiado de cada
    // cuadre donde se recibieron; la deuda pendiente quitaba del montoFiado
    // del cuadre de origen.
    for (const pago of pagos) {
      // Los cobros directos no tocaron ninguna gaveta: no hay qué revertir.
      if (!pago.cuadreId) continue
      await tx
        .update(cuadres)
        .set({ montoCobradoFiado: sql`GREATEST(${cuadres.montoCobradoFiado} - ${pago.monto}, 0)` })
        .where(eq(cuadres.id, pago.cuadreId))
    }
    if (pendiente > 0 && cuenta.cuadreOrigenId) {
      await tx
        .update(cuadres)
        .set({ montoFiado: sql`GREATEST(${cuadres.montoFiado} - ${pendiente}, 0)` })
        .where(eq(cuadres.id, cuenta.cuadreOrigenId))
    }

    await tx.delete(cuentasFiadoItems).where(eq(cuentasFiadoItems.cuentaFiadoId, id))
    await tx.delete(pagosFiado).where(eq(pagosFiado.cuentaFiadoId, id))
    await tx.delete(cuentasFiado).where(eq(cuentasFiado.id, id))
  })

  return { id }
})
