import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../database/client'
import { accesos, dispositivos } from '../database/schema'
import type { TipoAcceso } from '../database/schema'

/**
 * Identidad de dispositivo (Fase 2).
 *
 * Cada APK genera un UUID en su primer arranque y lo manda en el header
 * `x-dispositivo-id`. El servidor lo usa para:
 *  - provisionar la fila de `dispositivos` en el primer login online,
 *  - auditar accesos por equipo (`accesos`),
 *  - rechazar syncs de un dispositivo revocado desde el panel.
 *
 * Es independiente del usuario: varias personas pueden entrar con el mismo
 * aparato y el panel ve "con qué usuarios accedió".
 */

export const HEADER_DISPOSITIVO = 'x-dispositivo-id'
export const HEADER_VERSION_CODE = 'x-app-version-code'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** IDs de dispositivo válidos (UUID). Cualquier otra cosa se ignora. */
export function leerDispositivoId(event: H3Event): string | null {
  const raw = getHeader(event, HEADER_DISPOSITIVO)?.trim()
  if (!raw || !UUID_RE.test(raw)) return null
  return raw.toLowerCase()
}

/** Modelo/versión que el aparato reporta al sincronizar (recortados). */
function recortar(valor: string | null | undefined, max: number): string | null {
  if (valor == null) return null
  const limpio = String(valor).trim()
  return limpio ? limpio.slice(0, max) : null
}

function leerAppVersion(event: H3Event): string | null {
  return recortar(getHeader(event, HEADER_VERSION_CODE), 32)
}

function leerIp(event: H3Event): string | null {
  try {
    return recortar(getRequestIP(event, { xForwardedFor: true }), 64)
  } catch {
    return null
  }
}

export interface DatosDispositivo {
  modelo?: string | null
  android?: string | null
  appVersion?: string | null
  pendientes?: number
}

export interface AccesoDispositivo {
  puestoId: string
  usuarioId: string | null
  tipo: TipoAcceso
}

/**
 * Inserta una fila de auditoría. No lanza: un fallo de auditoría no debe
 * tumbar un login ni una sincronización.
 */
async function registrarAcceso(
  event: H3Event,
  { puestoId, usuarioId, tipo, dispositivoId }: AccesoDispositivo & { dispositivoId: string | null }
): Promise<void> {
  try {
    await db.insert(accesos).values({
      puestoId,
      dispositivoId,
      usuarioId,
      tipo,
      appVersion: leerAppVersion(event),
      ip: leerIp(event)
    })
  } catch (err) {
    console.error('[accesos] no se pudo registrar el acceso:', err)
  }
}

/**
 * Garantiza la fila de `dispositivos` y registra el acceso.
 *
 * Se llama en el login (aprovisionamiento + login) y en el logout. Si la
 * petición no trae header de dispositivo (web), solo se audita el acceso con
 * `dispositivoId = null`.
 */
export async function registrarAccesoDispositivo(
  event: H3Event,
  { puestoId, usuarioId, tipo, datos }: AccesoDispositivo & { datos?: DatosDispositivo }
): Promise<string | null> {
  const dispositivoId = leerDispositivoId(event)
  const ahora = new Date()

  if (dispositivoId) {
    // INSERT ... ON CONFLICT DO NOTHING + UPDATE: dos logins simultáneos del
    // mismo aparato no chocan en la PK y el UPDATE es idempotente.
    const creado = await db
      .insert(dispositivos)
      .values({
        id: dispositivoId,
        puestoId,
        ultimaConexionEn: ahora,
        provisionadoEn: ahora,
        creadoEn: ahora,
        actualizadoEn: ahora,
        ...datos
      })
      .onConflictDoNothing()
      .returning({ id: dispositivos.id })

    await db
      .update(dispositivos)
      .set({
        puestoId,
        ultimaConexionEn: ahora,
        actualizadoEn: ahora,
        ...datos
      })
      .where(eq(dispositivos.id, dispositivoId))

    if (creado.length > 0) {
      await registrarAcceso(event, {
        puestoId,
        usuarioId,
        tipo: 'activacion',
        dispositivoId
      })
    }
  }

  await registrarAcceso(event, {
    puestoId,
    usuarioId,
    tipo,
    dispositivoId
  })

  return dispositivoId
}

/**
 * Gate de los endpoints de sync: un dispositivo revocado no puede subir ni
 * bajar datos. Si no hay header (web o APK anterior) o la fila aún no existe
 * (token emitido antes de esta versión), se deja pasar.
 */
export async function exigirDispositivoActivo(
  event: H3Event,
  puestoId: string
): Promise<string | null> {
  const dispositivoId = leerDispositivoId(event)
  if (!dispositivoId) return null

  const [dispositivo] = await db
    .select({ puestoId: dispositivos.puestoId, revocado: dispositivos.revocado })
    .from(dispositivos)
    .where(eq(dispositivos.id, dispositivoId))
    .limit(1)

  if (!dispositivo) return dispositivoId

  if (dispositivo.revocado) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Este dispositivo fue revocado. Contacta al administrador.'
    })
  }

  if (dispositivo.puestoId !== puestoId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'El dispositivo pertenece a otro puesto.'
    })
  }

  return dispositivoId
}

/**
 * Variante solo para el login: bloquea un equipo revocado sin exigir que ya
 * pertenezca al puesto. En el primer login la fila aún no existe y en un
 * traslado el login es justo el momento de reasignarlo.
 */
export async function exigirDispositivoNoRevocado(event: H3Event): Promise<void> {
  const dispositivoId = leerDispositivoId(event)
  if (!dispositivoId) return

  const [dispositivo] = await db
    .select({ revocado: dispositivos.revocado })
    .from(dispositivos)
    .where(eq(dispositivos.id, dispositivoId))
    .limit(1)

  if (dispositivo?.revocado) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Este dispositivo fue revocado. Contacta al administrador.'
    })
  }
}

/**
 * Actualiza el estado que el aparato reporta tras sincronizar
 * (`POST /api/sync/estado`): conexión, pendientes y última sync OK.
 *
 * Devuelve el id del dispositivo, o null si la petición no lo trae (web).
 */
export async function actualizarEstadoDispositivo(
  event: H3Event,
  puestoId: string,
  datos: DatosDispositivo & { syncOk?: boolean }
): Promise<string | null> {
  const dispositivoId = leerDispositivoId(event)
  if (!dispositivoId) return null

  const { syncOk, ...resto } = datos
  const ahora = new Date()
  const estado = {
    ultimaConexionEn: ahora,
    actualizadoEn: ahora,
    ...resto,
    ...(syncOk ? { ultimaSyncOkEn: ahora } : {})
  }

  const creado = await db
    .insert(dispositivos)
    .values({
      id: dispositivoId,
      puestoId,
      provisionadoEn: ahora,
      creadoEn: ahora,
      ...estado
    })
    .onConflictDoNothing()
    .returning({ id: dispositivos.id })

  await db
    .update(dispositivos)
    .set(estado)
    .where(eq(dispositivos.id, dispositivoId))

  if (creado.length > 0) {
    await registrarAcceso(event, {
      puestoId,
      usuarioId: null,
      tipo: 'activacion',
      dispositivoId
    })
  }

  return dispositivoId
}
