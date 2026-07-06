import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const eliminado = await db
    .delete(productos)
    .where(eq(productos.id, id))
    .returning({ id: productos.id })

  if (eliminado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Producto no encontrado.' })
  }

  return { success: true, id: eliminado[0]!.id }
})
