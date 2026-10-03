import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres, cuadreItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string

  // Primero el puesto (404 si no existe o es ajeno), antes de revelar estado.
  const cuadre = await exigirPuesto(auth, 'cuadres', id, 'Cuadre') as typeof cuadres.$inferSelect

  // Un cuadre cerrado es historia contable (FIFO, costos congelados, reaperturas
  // por contramovimiento): no se borra. Solo el borrador abierto se elimina,
  // con sus lineas en la misma transaccion.
  if (cuadre.estado !== 'abierto') {
    throw createError({
      statusCode: 409,
      statusMessage: 'No se puede eliminar un cuadre cerrado. Reábrelo si necesitas corregirlo.'
    })
  }

  await db.transaction(async (tx) => {
    await tx.delete(cuadreItems).where(eq(cuadreItems.cuadreId, id))
    await tx.delete(cuadres).where(eq(cuadres.id, id))
  })

  return { success: true, id }
})
