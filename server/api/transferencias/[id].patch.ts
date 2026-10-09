import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, transferenciaItems, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'
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
  const { monto } = parsed.data

  // 404 si no existe O si es de otro puesto (misma respuesta).
  const transferencia = await exigirPuesto(auth, 'transferencias', id, 'Transferencia')

  const nuevoTotal = Math.round(monto * 100) / 100

  const delta = nuevoTotal - transferencia.montoTotal

  await db.transaction(async (tx) => {
    // Las líneas históricas por producto (modelo anterior) se retiran: el
    // monto manda y el tope ya no las consume.
    await tx.delete(transferenciaItems).where(eq(transferenciaItems.transferenciaId, id))

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
