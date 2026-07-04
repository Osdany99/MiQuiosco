import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const toggleActivoSchema = z.object({
  activo: z.boolean()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = toggleActivoSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const actualizado = await db
    .update(usuarios)
    .set({ activo: parsed.data.activo, actualizadoEn: new Date() })
    .where(eq(usuarios.id, id))
    .returning()

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }

  const u = actualizado[0]!
  return {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    debeCambiarPin: u.debeCambiarPin,
    creadoEn: u.creadoEn.toISOString(),
    actualizadoEn: u.actualizadoEn.toISOString()
  }
})
