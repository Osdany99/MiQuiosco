import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const eliminado = await db
    .delete(clientes)
    .where(eq(clientes.id, id))
    .returning({ id: clientes.id })

  if (eliminado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
  }

  return { success: true, id: eliminado[0]!.id }
})
