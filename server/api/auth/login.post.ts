import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { puestos, usuarios } from '../../database/schema'
import { verifyPin, signToken } from '../../utils/auth'
import { leerDispositivoId, registrarAccesoDispositivo } from '../../utils/dispositivo'
import { loginSchema } from '#shared/schemas/login'
import type { LoginResponse, Rol } from '#shared/types'

/**
 * POST /api/auth/login
 *
 * Estrategia:
 * - jefe: recibe JWT con scope 'sync' (acceso a /api/sync/* y demás API)
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

  // Solo el jefe entra a la app: el trabajador no se loguea (decision de
  // producto, Fase 3). Sin esto, el trabajador quedaba en modo online sin
  // token y cada pantalla daba 401 sin Authorization.
  if (usuario.rol !== 'jefe') {
    throw createError({
      statusCode: 403,
      statusMessage: usuario.rol === 'cliente'
        ? 'Los clientes no pueden iniciar sesión aún. Próximamente habilitado.'
        : 'Solo el jefe puede iniciar sesión.'
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

  // El dispositivo no conoce su puesto antes de entrar (el login es solo por
  // nombre), así que el puesto viaja en la respuesta para que el APK pueda
  // crear la fila local y hacer el pull completo del puesto correcto.
  const [puesto] = await db
    .select({ id: puestos.id, nombre: puestos.nombre, activo: puestos.activo })
    .from(puestos)
    .where(eq(puestos.id, usuario.puestoId))
    .limit(1)

  // Identidad del APK (header x-dispositivo-id). El primer login online es el
  // aprovisionamiento: crea la fila de `dispositivos` y deja la traza de
  // acceso. Un fallo aquí NO bloquea el login: `/api/sync/estado` reintenta la
  // provisión en la siguiente sync.
  const dispositivoId = leerDispositivoId(event)
  try {
    await registrarAccesoDispositivo(event, {
      puestoId: usuario.puestoId,
      usuarioId: usuario.id,
      tipo: 'login'
    })
  } catch (err) {
    console.error('[login] no se pudo registrar el acceso del dispositivo:', err)
  }

  // A partir de aqui el rol es 'jefe': es el unico que recibe JWT con scope
  // 'sync' (acceso a /api/sync/* y demas API).
  const { token, expiraEn } = signToken({
    sub: usuario.id,
    rol: usuario.rol as Rol,
    scope: ['sync'],
    ...(dispositivoId ? { dispositivoId } : {})
  })

  return {
    token,
    expiraEn: expiraEn * 1000,
    puesto,
    ...baseResponse
  }
})
