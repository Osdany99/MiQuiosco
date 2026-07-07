import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole, hashPin } from '../../utils/auth'

const editarUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  rol: z.enum(['jefe', 'trabajador']).optional(),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener 4-6 dígitos numéricos.').optional(),
  activo: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = editarUsuarioSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const updateData: Record<string, unknown> = {
    actualizadoEn: new Date()
  }

  if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre
  if (parsed.data.rol !== undefined) updateData.rol = parsed.data.rol
  if (parsed.data.activo !== undefined) updateData.activo = parsed.data.activo
  if (parsed.data.pin !== undefined) {
    updateData.pinHash = await hashPin(parsed.data.pin)
    updateData.debeCambiarPin = true
  }

  if (Object.keys(updateData).length <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  const actualizado = await db
    .update(usuarios)
    .set(updateData)
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
