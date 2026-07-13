import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { updateClienteSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = updateClienteSchema.safeParse(body)

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
  if (parsed.data.telefono !== undefined) updateData.telefono = parsed.data.telefono
  if (parsed.data.notas !== undefined) updateData.notas = parsed.data.notas

  if (Object.keys(updateData).length <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  const actualizado = await db
    .update(clientes)
    .set(updateData)
    .where(eq(clientes.id, id))
    .returning()

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
  }

  const u = actualizado[0]!
  return {
    id: u.id,
    nombre: u.nombre,
    telefono: u.telefono,
    notas: u.notas,
    creadoEn: u.creadoEn.toISOString(),
    actualizadoEn: u.actualizadoEn.toISOString()
  }
})
