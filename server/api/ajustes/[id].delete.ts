import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ajustes, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const [ajuste] = await db
    .select()
    .from(ajustes)
    .where(eq(ajustes.id, id))
    .limit(1)

  if (!ajuste) {
    throw createError({ statusCode: 404, statusMessage: 'Ajuste no encontrado.' })
  }

  await db.transaction(async (tx) => {
    const campo = ajuste.tipo === 'regalo' ? cuadres.montoRegalo : cuadres.montoDescuento
    await tx
      .update(cuadres)
      .set({ [campo.name]: sql`GREATEST(${campo} - ${ajuste.monto}, 0)` })
      .where(eq(cuadres.id, ajuste.cuadreId))

    await tx.delete(ajustes).where(eq(ajustes.id, id))
  })

  return { id }
})
