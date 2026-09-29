import { and, eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../database/client'
import { usuarios, webauthnChallenges } from '../database/schema'
import { signToken, verifyPin } from './auth'
import type { Rol } from '#shared/types'

export const WEBAUTHN_CHALLENGE_MINUTOS = 5

export interface RpInfo {
  rpID: string
  origin: string
}

/**
 * RP ID y Origin derivados del host del request: funciona en localhost
 * (dev) y en producción sin variables extra. Cada entorno enrola aparte
 * porque las credenciales quedan ligadas al RP ID.
 */
export function getRpInfo(event: H3Event): RpInfo {
  const host = (getRequestHost(event) || '').split(':')[0] || 'localhost'
  const proto = getHeader(event, 'x-forwarded-proto')
    || (host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https')
  return { rpID: host, origin: `${proto}://${getRequestHost(event)}` }
}

export interface UsuarioWebauthn {
  id: string
  nombre: string
  rol: string
  puestoId: string
  pinHash: string
  activo: boolean
}

export async function buscarUsuarioPorNombre(nombre: string): Promise<UsuarioWebauthn | null> {
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
    .where(eq(usuarios.nombre, nombre))
    .limit(1)
  return result[0] ?? null
}

export function credencialesInvalidas(): never {
  throw createError({ statusCode: 401, statusMessage: 'Credenciales inválidas.' })
}

export async function exigirPinValido(nombre: string, pin: string): Promise<UsuarioWebauthn> {
  const usuario = await buscarUsuarioPorNombre(nombre)
  if (!usuario || !usuario.activo) credencialesInvalidas()
  const pinOk = await verifyPin(pin, (usuario as UsuarioWebauthn).pinHash)
  if (!pinOk) credencialesInvalidas()
  return usuario as UsuarioWebauthn
}

/** Borra challenges vencidos (limpieza perezosa en cada emisión). */
export async function limpiarChallengesVencidos(): Promise<void> {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiraEn, new Date()))
}

/** Guarda un challenge (reemplaza el anterior del mismo tipo). */
export async function emitirChallenge(usuarioId: string, tipo: 'registration' | 'authentication', challenge: string): Promise<void> {
  await limpiarChallengesVencidos()
  await db.delete(webauthnChallenges).where(
    and(eq(webauthnChallenges.usuarioId, usuarioId), eq(webauthnChallenges.tipo, tipo))
  )
  await db.insert(webauthnChallenges).values({
    usuarioId,
    tipo,
    challenge,
    expiraEn: new Date(Date.now() + WEBAUTHN_CHALLENGE_MINUTOS * 60 * 1000)
  })
}

/**
 * Recupera y consume (borra) el challenge vigente. Null si no hay o venció:
 * el cliente debe pedir options de nuevo.
 */
export async function consumirChallenge(usuarioId: string, tipo: 'registration' | 'authentication'): Promise<string | null> {
  const rows = await db
    .select()
    .from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.usuarioId, usuarioId), eq(webauthnChallenges.tipo, tipo)))
  const valido = rows.find(r => r.expiraEn.getTime() > Date.now()) ?? null
  // Se borran todos los del tipo (válidos o no): un solo uso.
  await db.delete(webauthnChallenges).where(
    and(eq(webauthnChallenges.usuarioId, usuarioId), eq(webauthnChallenges.tipo, tipo))
  )
  return valido?.challenge ?? null
}

/**
 * Misma respuesta que POST /api/auth/login: token con scope sync para el
 * jefe, expiraEn para el trabajador (sin JWT). Así el cliente reutiliza
 * procesarRespuestaLogin sin cambios.
 */
export async function emitirRespuestaLogin(event: H3Event, usuario: UsuarioWebauthn) {
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
  if (usuario.rol === 'trabajador') {
    const config = useRuntimeConfig(event)
    const horasExp = Number(config.public.sessionExpirationTrabajadorHoras) || 24
    return { ...baseResponse, expiraEn: Date.now() + horasExp * 60 * 60 * 1000 }
  }
  const { token, expiraEn } = signToken({ sub: usuario.id, rol: usuario.rol as Rol, scope: ['sync'] })
  return { token, expiraEn: expiraEn * 1000, ...baseResponse }
}
