import { z } from 'zod'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole, hashPin } from '../../utils/auth'

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100),
  rol: z.enum(['admin', 'jefe', 'trabajador']),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener 4-6 dígitos numéricos.'),
  activo: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'admin')

  const body = await readBody(event)
  const parsed = crearUsuarioSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { nombre, rol, pin, activo = true } = parsed.data
  const pinHash = await hashPin(pin)

  const nuevo = await db
    .insert(usuarios)
    .values({
      puestoId: auth.usuario.puestoId,
      nombre,
      rol,
      pinHash,
      activo,
      debeCambiarPin: true
    })
    .returning()

  const u = nuevo[0]!
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
