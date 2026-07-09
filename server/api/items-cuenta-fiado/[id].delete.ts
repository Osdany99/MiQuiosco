import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiadoItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const eliminado = await db
    .delete(cuentasFiadoItems)
    .where(eq(cuentasFiadoItems.id, id))
    .returning()

  if (eliminado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Item no encontrado.' })
  }

  return { success: true }
})
