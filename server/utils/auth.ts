import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../database/client'
import { puestos, usuarios } from '../database/schema'
import { leerDispositivoId } from './dispositivo'
import type { Rol } from '#shared/types'

/**
 * Contexto de autenticación disponible en event.context.auth
 * después de pasar por el middleware server/middleware/auth.ts.
 */
export interface AuthContext {
  usuario: {
    id: string
    nombre: string
    rol: Rol
    puestoId: string
  }
  scope: ('sync')[]
  /** Identidad del APK que hace la petición (header x-dispositivo-id). */
  dispositivoId: string | null
}

/**
 * Payload interno del JWT. Se serializa al firmar y se lee al verificar.
 */
interface JwtPayload {
  sub: string
  rol: Rol
  scope: ('sync')[]
  expiraEn: number
  /** Dispositivo que pidió el token. Opcional: tokens previos no lo traen. */
  dispositivoId?: string
  /**
   * Versión del usuario al emitir el token. Un reset de PIN la incrementa y
   * deja fuera los tokens antiguos. Opcional: los tokens previos no la traen.
   */
  tokenVersion?: number
}

const JWT_EXPIRATION_SYNC_SEC = 60 * 60 * 24

const tokenBlacklist = new Set<string>()

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

export function signToken(
  payload: Omit<JwtPayload, 'expiraEn'>
): { token: string, expiraEn: number } {
  const secret = getJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const expiraEn = now + JWT_EXPIRATION_SYNC_SEC

  const token = jwt.sign(
    { ...payload, scope: ['sync'], expiraEn },
    secret,
    { expiresIn: '24h' }
  )
  return { token, expiraEn }
}
export function verifyToken(token: string): JwtPayload | null {
  if (tokenBlacklist.has(token)) return null

  try {
    const secret = getJwtSecret()
    const decoded = jwt.verify(token, secret) as JwtPayload
    return decoded
  } catch {
    return null
  }
}

export function revokeToken(token: string): void {
  tokenBlacklist.add(token)
}

export async function requireAuth(
  event: H3Event,
  scopeRequerido: 'sync' = 'sync'
): Promise<AuthContext> {
  const header = getHeader(event, 'authorization')
  if (!header || !header.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No autenticado. Falta header Authorization.'
    })
  }

  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Token inválido o expirado.'
    })
  }

  if (!payload.scope.includes(scopeRequerido)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Token sin permisos para scope '${scopeRequerido}'.`
    })
  }

  // Binding dispositivo↔token: si el JWT se emitió para un dispositivo y la
  // petición trae OTRO, se rechaza. Los tokens antiguos (sin claim) y las
  // peticiones sin header (web) siguen pasando.
  const dispositivoId = leerDispositivoId(event)
  if (payload.dispositivoId && dispositivoId && payload.dispositivoId !== dispositivoId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El token pertenece a otro dispositivo.'
    })
  }

  verificarVersionMinima(event)

  const result = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      puestoId: usuarios.puestoId,
      activo: usuarios.activo,
      tokenVersion: usuarios.tokenVersion,
      puestoActivo: puestos.activo
    })
    .from(usuarios)
    .innerJoin(puestos, eq(puestos.id, usuarios.puestoId))
    .where(eq(usuarios.id, payload.sub))
    .limit(1)

  const usuario = result[0]
  if (!usuario || !usuario.activo) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Usuario no existe o está desactivado.'
    })
  }

  // Desactivar un puesto corta el acceso de todos sus equipos sin tener que
  // tocar usuario por usuario.
  if (!usuario.puestoActivo) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El puesto está desactivado. Contacta al administrador.'
    })
  }

  // Reset de PIN → los tokens emitidos antes quedan invalidados al instante.
  if (payload.tokenVersion != null && payload.tokenVersion !== usuario.tokenVersion) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sesión invalidada. Vuelve a iniciar sesión.'
    })
  }

  return {
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      puestoId: usuario.puestoId
    },
    scope: payload.scope,
    dispositivoId
  }
}

export async function requireRole(
  event: H3Event,
  ...rolesPermitidos: Rol[]
): Promise<AuthContext> {
  const auth = await requireAuth(event, 'sync')
  if (!rolesPermitidos.includes(auth.usuario.rol)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Acceso restringido a roles: ${rolesPermitidos.join(', ')}.`
    })
  }
  return auth
}

/**
 * Guard del panel: exige rol `super_admin` Y que su puesto sea el central y
 * esté activo. Así, aunque alguien manipule el rol en la BD, no obtiene acceso
 * si no pertenece al puesto de administración.
 */
export async function requireSuperAdmin(event: H3Event): Promise<AuthContext> {
  const auth = await requireAuth(event, 'sync')

  if (auth.usuario.rol !== 'super_admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Acceso restringido al super administrador.'
    })
  }

  const [puesto] = await db
    .select({ central: puestos.central, activo: puestos.activo })
    .from(puestos)
    .where(eq(puestos.id, auth.usuario.puestoId))
    .limit(1)

  if (!puesto?.central || !puesto.activo) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El super administrador debe pertenecer a un puesto central activo.'
    })
  }

  return auth
}

/**
 * Gate de versión mínima de la APK.
 *
 * El cliente nativo envía su versionCode en el header `x-app-version-code`
 * (ver `app/utils/api.js`). Si es menor que APP_MIN_VERSION_CODE, se
 * rechaza con 426 para que una APK obsoleta no pueda subir datos con un
 * esquema incompatible. Los clientes sin header (web, APKs anteriores al
 * sistema de actualización) no se bloquean aquí.
 */
function verificarVersionMinima(event: H3Event): void {
  const min = Number(process.env.APP_MIN_VERSION_CODE ?? 0)
  if (!Number.isFinite(min) || min <= 0) return
  const header = getHeader(event, 'x-app-version-code')
  if (header == null || header === '') return
  const code = Number(header)
  if (Number.isFinite(code) && code < min) {
    throw createError({
      statusCode: 426,
      statusMessage: 'Actualización requerida. Instala la última versión de MiQuiosco para continuar.'
    })
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET debe estar definido y tener al menos 32 caracteres. '
      + 'Define uno seguro en tu archivo .env.'
    )
  }
  return secret
}
