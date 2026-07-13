import { eq } from 'drizzle-orm'
import { db } from '../../../database/client'
import { usuarios } from '../../../database/schema'
import { requireRole, hashPin } from '../../../utils/auth'
import { resetPinSchema } from '../../../../shared/schemas'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = resetPinSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PIN inválido.',
      data: parsed.error.flatten()
    })
  }

  const pinHash = await hashPin(parsed.data.pin)

  const actualizado = await db
    .update(usuarios)
    .set({ pinHash, actualizadoEn: new Date() })
    .where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, nombre: usuarios.nombre })

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }

  return { success: true, ...actualizado[0]! }
})
