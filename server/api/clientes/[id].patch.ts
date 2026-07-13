import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { updateClienteSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  const body = await readBody(event)
  const parsed = updateClienteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const actualizado = await db
    .update(clientes)
    .set({ ...parsed.data, actualizadoEn: new Date() })
    .where(eq(clientes.id, id))
    .returning()
  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
  }
  const c = actualizado[0]!
  return {
    id: c.id,
    puestoId: c.puestoId,
    nombre: c.nombre,
    telefono: c.telefono,
    notas: c.notas,
    activo: c.activo,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }
})
