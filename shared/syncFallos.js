import { z } from 'zod'

/**
 * Fallos de sincronización (Fase 3).
 *
 * Un fallo es un registro de diagnóstico, no un dato de negocio: el servidor
 * los agrupa por `(puesto, clave)` e incrementa `intentos`, y el APK los guarda
 * en un buzón local hasta que puede subirlos.
 *
 * Regla de oro: aquí NUNCA viaja un PIN, un `pinHash`, un token ni una cabecera
 * Authorization. El servidor vuelve a redactar por si acaso.
 */

export const TIPOS_FALLO_SYNC = [
  'push_rechazo',
  'sync_error',
  'pull_error',
  'login_offline',
  'otro'
]

export const FASES_FALLO_SYNC = [
  'push',
  'pull',
  'sync',
  'login',
  'arranque'
]

const jsonLibre = z.union([
  z.record(z.string(), z.any()),
  z.array(z.any()),
  z.null()
])

export const falloSyncSchema = z.object({
  tipo: z.enum(TIPOS_FALLO_SYNC),
  fase: z.enum(FASES_FALLO_SYNC).nullish(),
  tabla: z.string().trim().max(60).nullish(),
  /** id de la fila que falló (uuid o el id que use la tabla). */
  registroId: z.string().trim().max(100).nullish(),
  loteId: z.string().trim().max(60).nullish(),
  codigoHttp: z.number().int().min(0).max(999).nullish(),
  /** Clasificación corta: padre_ausente, validacion, duplicado, red, ... */
  motivo: z.string().trim().max(80).nullish(),
  mensaje: z.string().trim().max(2000).nullish(),
  /** Fila rechazada, ya redactada por el cliente. */
  fila: jsonLibre.optional(),
  /** Trazas alrededor del fallo, ya redactadas y recortadas. */
  contexto: jsonLibre.optional(),
  appVersion: z.string().trim().max(32).nullish(),
  dispositivo: z.string().trim().max(80).nullish(),
  /** Epoch ms o ISO; el servidor lo acota. */
  ocurridoEn: z.union([z.string(), z.number()]).nullish(),
  intentos: z.number().int().min(1).max(1_000_000).optional()
})

export const fallosSyncSchema = z.object({
  fallos: z.array(falloSyncSchema).min(1).max(100)
})

/**
 * Traduce un error del push a un rechazo por fila.
 *
 * - 401/403 son de seguridad: `fatal` y abortan TODO el push (fail-closed).
 * - 404 (padre ausente) y los errores de red/servidor son transitorios: la
 *   fila se queda pendiente y se reintenta en la próxima sync.
 * - Los de validación/constraint son permanentes: reintentar no arregla nada y
 *   el panel debe enseñarlos para corregirlos.
 */
export function clasificarRechazo(err) {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  const pgCode = String(err?.code ?? '')
  const mensaje = String(
    err?.statusMessage || err?.message || 'Error desconocido.'
  ).slice(0, 2000)

  const base = (motivo, transitorio, fatal = false) => ({
    motivo,
    transitorio,
    fatal,
    codigo: status || pgCode || 'error',
    mensaje
  })

  if (status === 401 || status === 403) return base('puesto_ajeno', false, true)
  if (status === 404) return base('padre_ausente', true)
  if (status === 409) return base('conflicto', false)
  if (status === 400 || status === 422) return base('validacion', false)

  // SQLSTATE
  if (pgCode === '23503') return base('padre_ausente', true)
  if (pgCode === '23505') return base('duplicado', false)
  if (pgCode === '23502') return base('validacion', false)
  if (pgCode.startsWith('22')) return base('validacion', false)
  if (pgCode === '40001' || pgCode === '40P01') return base('transitorio', true)

  if (status >= 500) return base('servidor', true)
  return base('desconocido', true)
}

/**
 * Clave estable de un fallo. No incluye el mensaje (que cambia entre intentos)
 * ni datos del dispositivo: el servidor deduplica por puesto + clave.
 */
export function claveFallo(partes) {
  return [
    partes?.tipo ?? '',
    partes?.fase ?? '',
    partes?.tabla ?? '',
    partes?.registroId ?? '',
    partes?.motivo ?? '',
    partes?.codigoHttp ?? ''
  ].join('|')
}
