import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, transferenciaItems, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  // 404 si no existe O si es de otro puesto (misma respuesta).
  const transferencia = await exigirPuesto(auth, 'transferencias', id, 'Transferencia')

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
