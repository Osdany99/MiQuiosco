import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../database/client'
import { usuarios } from '../database/schema'
import type { Rol } from '../../shared/types'

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
    debeCambiarPin: boolean
  }
  scope: ('admin' | 'sync')[]
}

/**
 * Payload interno del JWT. Se serializa al firmar y se lee al verificar.
 */
interface JwtPayload {
  sub: string // usuario.id
  rol: Rol
  scope: ('admin' | 'sync')[]
  expiraEn: number // timestamp UNIX en segundos
}

/**
 * Tiempo de expiración del JWT en segundos.
 * - 8 horas para tokens con scope 'admin'
 * - 30 días para tokens con scope 'sync' (jefe)
 */
const JWT_EXPIRATION_ADMIN_SEC = 60 * 60 * 8
const JWT_EXPIRATION_SYNC_SEC = 60 * 60 * 24 * 30

/**
 * Lista negra simple en memoria para tokens revocados (logout).
 * Se pierde al reiniciar el servidor, aceptable para v1.
 */
const tokenBlacklist = new Set<string>()

/**
 * Hashea un PIN en texto plano usando bcrypt.
 * El PIN debe ser de 4-6 dígitos numéricos.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

/**
 * Compara un PIN en texto plano contra un hash bcrypt.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

/**
 * Genera un JWT firmado.
 *
 * @param payload - Datos a firmar
 * @param scope - Define qué endpoints puede acceder ('admin' o 'sync')
 */
export function signToken(
  payload: Omit<JwtPayload, 'expiraEn'>,
  scope: 'admin' | 'sync'
): { token: string, expiraEn: number } {
  const secret = getJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const ttl
    = scope === 'admin' ? JWT_EXPIRATION_ADMIN_SEC : JWT_EXPIRATION_SYNC_SEC
  const expiraEn = now + ttl

  const token = jwt.sign(
    { ...payload, scope, expiraEn },
    secret,
    { expiresIn: scope === 'admin' ? '8h' : '30d' }
  )
  return { token, expiraEn }
}

/**
 * Verifica la firma y expiración de un JWT.
 * Devuelve el payload si es válido, o null si expiró/fue revocado.
 */
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

/**
 * Añade un token a la blacklist (usado en logout).
 */
export function revokeToken(token: string): void {
  tokenBlacklist.add(token)
}

/**
 * Lee y valida el header Authorization de una request.
 * Devuelve el contexto de auth si el token es válido y pertenece al scope.
 */
export async function requireAuth(
  event: H3Event,
  scopeRequerido: 'admin' | 'sync' = 'admin'
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

  // Verificar que el usuario sigue existiendo y activo
  const result = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      puestoId: usuarios.puestoId,
      activo: usuarios.activo,
      debeCambiarPin: usuarios.debeCambiarPin
    })
    .from(usuarios)
    .where(eq(usuarios.id, payload.sub))
    .limit(1)

  const usuario = result[0]
  if (!usuario || !usuario.activo) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Usuario no existe o está desactivado.'
    })
  }

  return {
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      puestoId: usuario.puestoId,
      debeCambiarPin: usuario.debeCambiarPin
    },
    scope: payload.scope
  }
}

/**
 * Helper: requiere rol específico, lanzando 403 si no coincide.
 */
export async function requireRole(
  event: H3Event,
  ...rolesPermitidos: Rol[]
): Promise<AuthContext> {
  const auth = await requireAuth(event, 'admin')
  if (!rolesPermitidos.includes(auth.usuario.rol)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Acceso restringido a roles: ${rolesPermitidos.join(', ')}.`
    })
  }
  return auth
}

/**
 * Recupera el JWT_SECRET de las variables de entorno.
 */
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
