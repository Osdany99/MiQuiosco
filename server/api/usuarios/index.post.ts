import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole, hashPin } from '../../utils/auth'
import { createUsuarioSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')

  const body = await readBody(event)
  const parsed = createUsuarioSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { nombre, rol, pin, activo = true, salario } = parsed.data
  const pinHash = await hashPin(pin)

  const nuevo = await db
    .insert(usuarios)
    .values({
      puestoId: auth.usuario.puestoId,
      nombre,
      rol,
      pinHash,
      activo,
      salario: salario != null ? String(salario) : '600'
    })
    .returning()

  const u = nuevo[0]!
  return {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    salario: Number(u.salario),
    creadoEn: u.creadoEn.toISOString(),
    actualizadoEn: u.actualizadoEn.toISOString()
  }
})
