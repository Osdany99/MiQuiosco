import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, transferenciaItems, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const [transferencia] = await db
    .select()
    .from(transferencias)
    .where(eq(transferencias.id, id))
    .limit(1)

  if (!transferencia) {
    throw createError({ statusCode: 404, statusMessage: 'Transferencia no encontrada.' })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(cuadres)
      .set({ montoTransferencia: sql`GREATEST(${cuadres.montoTransferencia} - ${transferencia.montoTotal}, 0)` })
      .where(eq(cuadres.id, transferencia.cuadreId))

    await tx.delete(transferenciaItems).where(eq(transferenciaItems.transferenciaId, id))
    await tx.delete(transferencias).where(eq(transferencias.id, id))
  })

  return { id }
})
