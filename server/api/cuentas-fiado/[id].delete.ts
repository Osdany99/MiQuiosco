import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  // 404 si no existe O si es de otro puesto (misma respuesta).
  const cuenta = await exigirPuesto(auth, 'cuentas_fiado', id, 'Cuenta de fiado')

  const pagos = await db.select().from(pagosFiado).where(eq(pagosFiado.cuentaFiadoId, id))
  const pendiente = cuenta.montoTotal - cuenta.montoPagado

  // Un cuadre cerrado es historia: sus montos son el snapshot de ese día y no se
  // reescriben. Misma regla que cobrarDeuda (app/composables/useCuentasFiado.js).
  // Se borra la deuda igual, pero sin tocar las gavetas del cuadre.
  const [origen] = cuenta.cuadreOrigenId
    ? await db.select({ estado: cuadres.estado }).from(cuadres).where(eq(cuadres.id, cuenta.cuadreOrigenId)).limit(1)
    : [null]
  const origenAbierto = !origen || origen.estado === 'abierto'

  await db.transaction(async (tx) => {
    // Revertir en cascada. Cada gaveta se devuelve por la que entró el dinero:
    // el abono inicial por transferencia está marcado con cuadreId (ver
    // index.post.ts) y es el ÚNICO pago con esa combinación, porque los cobros
    // posteriores van directo (cuadreId null) por diseño.
    for (const pago of pagos) {
      // Los cobros directos no tocaron ninguna gaveta: no hay qué revertir.
      if (!pago.cuadreId || !origenAbierto) continue
      if (pago.formaPago === 'transferencia') {
        await tx
          .update(cuadres)
          .set({ montoTransferencia: sql`GREATEST(${cuadres.montoTransferencia} - ${pago.monto}, 0)` })
          .where(eq(cuadres.id, pago.cuadreId))
      } else {
        await tx
          .update(cuadres)
          .set({ montoCobradoFiado: sql`GREATEST(${cuadres.montoCobradoFiado} - ${pago.monto}, 0)` })
          .where(eq(cuadres.id, pago.cuadreId))
      }
    }
    if (pendiente > 0 && cuenta.cuadreOrigenId && origenAbierto) {
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
