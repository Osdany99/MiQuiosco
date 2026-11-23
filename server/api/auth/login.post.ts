import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { puestos, usuarios } from '../../database/schema'
import { verifyPin, signToken } from '../../utils/auth'
import { leerDispositivoId, registrarAccesoDispositivo, exigirDispositivoNoRevocado } from '../../utils/dispositivo'
import { loginSchema } from '#shared/schemas/login'
import type { LoginResponse, Rol } from '#shared/types'

/**
 * POST /api/auth/login
 *
 * Estrategia:
 * - jefe: recibe JWT con scope 'sync' (acceso a /api/sync/* y demás API)
 * - trabajador: recibe JWT para las operaciones permitidas por su puesto; el
 *   sync completo y el resto de la administración siguen exigiendo rol jefe.
 * - super_admin: recibe JWT solo para el panel /api/admin/* (no usa el APK)
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
      activo: usuarios.activo,
      tokenVersion: usuarios.tokenVersion
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

  // El trabajador también entra con identidad propia. Cada endpoint decide su
  // matriz de permisos: no hereda el sync completo ni las funciones del jefe.
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

  // El dispositivo no conoce su puesto antes de entrar (el login es solo por
  // nombre), así que el puesto viaja en la respuesta para que el APK pueda
  // crear la fila local y hacer el pull completo del puesto correcto.
  const [puesto] = await db
    .select({ id: puestos.id, nombre: puestos.nombre, activo: puestos.activo, permisos: puestos.permisos })
    .from(puestos)
    .where(eq(puestos.id, usuario.puestoId))
    .limit(1)

  // Un puesto desactivado no emite tokens nuevos. Las sesiones ya abiertas las
  // corta requireAuth en la siguiente petición.
  if (!puesto?.activo) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El puesto está desactivado. Contacta al administrador.'
    })
  }

  // Identidad del APK (header x-dispositivo-id). Un equipo revocado no puede
  // volver a entrar ni sincronizar.
  await exigirDispositivoNoRevocado(event)

  // El primer login online es el aprovisionamiento: crea la fila de
  // `dispositivos` y deja la traza de acceso. Un fallo aquí NO bloquea el
  // login: `/api/sync/estado` reintenta la provisión en la siguiente sync.
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

  // El scope transporta el canal; la autorización efectiva se vuelve a evaluar
  // por rol y permisos del puesto en cada endpoint (sync completo = solo jefe).
  const { token, expiraEn } = signToken({
    sub: usuario.id,
    rol: usuario.rol as Rol,
    scope: ['sync'],
    tokenVersion: usuario.tokenVersion,
    ...(dispositivoId ? { dispositivoId } : {})
  })

  return {
    token,
    expiraEn: expiraEn * 1000,
    puesto: {
      id: puesto.id,
      nombre: puesto.nombre,
      activo: puesto.activo,
      permisos: (puesto.permisos ?? {}) as Record<string, boolean>
    },
    ...baseResponse
  }
})
