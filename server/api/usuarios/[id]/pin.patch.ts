import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../../database/client'
import { usuarios } from '../../../database/schema'
import { requireRole, hashPin } from '../../../utils/auth'

const resetPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener 4-6 dígitos numéricos.')
})

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
    .set({ pinHash, debeCambiarPin: true, actualizadoEn: new Date() })
    .where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, nombre: usuarios.nombre })

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }

  return { success: true, ...actualizado[0]! }
})
