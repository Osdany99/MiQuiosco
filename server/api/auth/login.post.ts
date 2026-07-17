import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { verifyPin, signToken } from '../../utils/auth'
import { loginSchema } from '#shared/schemas/login'
import type { LoginResponse, Rol } from '#shared/types'

/**
 * POST /api/auth/login
 *
 * Estrategia:
 * - jefe: recibe JWT con scope 'sync'
 * - jefe: recibe JWT con scope 'sync' (acceso SOLO a /api/sync/*)
 * - trabajador: NO recibe token (la app usa la sesión local y el hash del PIN)
 */
export default defineEventHandler(async (event): Promise<LoginResponse> => {
  const body = await readBody(event)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { nombre_usuario, pin } = parsed.data

  // Buscar usuario por nombre
  const result = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      puestoId: usuarios.puestoId,
      pinHash: usuarios.pinHash,
      activo: usuarios.activo
    })
    .from(usuarios)
    .where(eq(usuarios.nombre, nombre_usuario))
    .limit(1)

  const usuario = result[0]

  // Por seguridad, devolver el mismo error si el usuario no existe o el PIN no calza
  if (!usuario || !usuario.activo) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Credenciales inválidas.'
    })
  }

  const pinOk = await verifyPin(pin, usuario.pinHash)
  if (!pinOk) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Credenciales inválidas.'
    })
  }

  if (usuario.rol === 'cliente') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Los clientes no pueden iniciar sesión aún. Próximamente habilitado.'
    })
  }

  const baseResponse = {
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      puestoId: usuario.puestoId
    }
  }

  // Trabajador: NO se emite JWT, devuelve también el hash para cache offline
  if (usuario.rol === 'trabajador') {
    const horasExp = Number(process.env.SESSION_EXPIRATION_TRABAJADOR_HORAS || 24)
    const msExp = horasExp * 60 * 60 * 1000
    return {
      ...baseResponse,
      expiraEn: Date.now() + msExp
    }
  }

  const { token, expiraEn } = signToken({
    sub: usuario.id,
    rol: usuario.rol as Rol,
    scope: ['sync']
  })

  return {
    token,
    expiraEn: expiraEn * 1000,
    ...baseResponse
  }
})
