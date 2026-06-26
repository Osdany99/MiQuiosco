import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { verifyPin, hashPin, signToken } from '../../utils/auth'
import type { LoginResponse, Rol } from '../../../shared/types'

const cambiarPinSchema = z.object({
  usuario_id: z.string().uuid(),
  pin_actual: z.string().regex(/^\d{4,6}$/),
  pin_nuevo: z.string().regex(/^\d{4,6}$/),
  pin_nuevo_confirmacion: z.string().regex(/^\d{4,6}$/)
})

/**
 * POST /api/auth/cambiar-pin-inicial
 *
 * Usado por el admin (o cualquier usuario con `debeCambiarPin = true`) en su
 * primer login. Valida el PIN actual contra el hash existente, aplica reglas
 * al PIN nuevo, lo hashea, actualiza el flag `debe_cambiar_pin` y devuelve
 * un JWT fresco para que el usuario entre a la app sin re-teclear credenciales.
 */
export default defineEventHandler(async (event): Promise<LoginResponse> => {
  const body = await readBody(event)
  const parsed = cambiarPinSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const {
    usuario_id,
    pin_actual,
    pin_nuevo,
    pin_nuevo_confirmacion
  } = parsed.data

  if (pin_nuevo !== pin_nuevo_confirmacion) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La confirmación del PIN nuevo no coincide.'
    })
  }

  if (pin_nuevo === pin_actual) {
    throw createError({
      statusCode: 400,
      statusMessage: 'El PIN nuevo debe ser diferente al actual.'
    })
  }

  const result = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      puestoId: usuarios.puestoId,
      pinHash: usuarios.pinHash,
      activo: usuarios.activo,
      debeCambiarPin: usuarios.debeCambiarPin
    })
    .from(usuarios)
    .where(eq(usuarios.id, usuario_id))
    .limit(1)

  const usuario = result[0]
  if (!usuario || !usuario.activo) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Usuario no encontrado o inactivo.'
    })
  }

  if (!usuario.debeCambiarPin) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Este usuario no tiene un cambio de PIN pendiente. Usa el endpoint de admin para resetear PIN.'
    })
  }

  const pinOk = await verifyPin(pin_actual, usuario.pinHash)
  if (!pinOk) {
    throw createError({
      statusCode: 401,
      statusMessage: 'PIN actual incorrecto.'
    })
  }

  const nuevoHash = await hashPin(pin_nuevo)

  await db
    .update(usuarios)
    .set({
      pinHash: nuevoHash,
      debeCambiarPin: false,
      actualizadoEn: new Date()
    })
    .where(eq(usuarios.id, usuario.id))

  // Generar token fresco para que entre a la app sin volver a loguear
  const scope = usuario.rol === 'admin' ? 'admin' : 'sync'
  const { token, expiraEn } = signToken(
    {
      sub: usuario.id,
      rol: usuario.rol as Rol,
      scope: [scope]
    },
    scope
  )

  return {
    token,
    expiraEn: expiraEn * 1000,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      puestoId: usuario.puestoId
    }
  }
})
