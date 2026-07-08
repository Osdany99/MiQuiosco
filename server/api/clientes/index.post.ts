import { z } from 'zod'
import { db } from '../../database/client'
import { clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const crearClienteSchema = z.object({
  nombre: z.string().min(1).max(200),
  telefono: z.string().nullable().optional(),
  notas: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = crearClienteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const { nombre, telefono = null, notas = null } = parsed.data
  const nuevo = await db
    .insert(clientes)
    .values({ puestoId: auth.usuario.puestoId, nombre, telefono, notas })
    .returning()
  const c = nuevo[0]!
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
