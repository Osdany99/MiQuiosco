import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const eliminado = await db
    .delete(usuarios)
    .where(eq(usuarios.id, id))
    .returning({ id: usuarios.id })

  if (eliminado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }

  return { success: true, id: eliminado[0]!.id }
})
