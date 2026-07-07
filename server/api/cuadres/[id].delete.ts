import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const eliminado = await db
    .delete(cuadres)
    .where(eq(cuadres.id, id))
    .returning()

  if (eliminado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
  }

  return { success: true }
})
