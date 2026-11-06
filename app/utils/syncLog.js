import { useDb } from '../server-offline/db/client'

/**
 * Trazas locales de sincronización (ring buffer).
 *
 * Objetivo: poder diagnosticar un fallo de sync en el propio teléfono (o desde
 * el panel, cuando el buzón suba el contexto en la fase 3) sin guardar datos
 * sensibles. Es telemetría: NINGÚN fallo al escribir una traza debe romper la
 * sincronización, por eso todo va envuelto en try/catch.
 *
 * Reglas:
 *  - Nunca PIN, `pinHash`, token ni cabeceras Authorization.
 *  - Cada traza es pequeña: textos recortados y `datos` limitado a 8 KB.
 *  - Solo se conservan las últimas 500 entradas.
 */

const MAX_ENTRADAS = 500
const MAX_TEXTO = 2000
const MAX_DATOS = 8000

/** Cualquier clave que suene a secreto se redacta antes de guardarse. */
const CLAVES_SECRETAS = /pin|token|authorization|password|contrase|secret|hash/i

function nuevoId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // fallback abajo
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`
}

/**
 * Copia el valor quitando claves sensibles y recortando tamaños. Exportada
 * para poder testearla sin tocar la base.
 */
export function redactarSyncLog(valor, profundidad = 0) {
  if (valor == null) return valor
  if (profundidad > 3) return '[…]'

  if (typeof valor === 'string') {
    return valor.length > 500 ? `${valor.slice(0, 500)}…` : valor
  }
  if (typeof valor !== 'object') return valor

  if (Array.isArray(valor)) {
    return valor.slice(0, 20).map(v => redactarSyncLog(v, profundidad + 1))
  }

  const salida = {}
  for (const [clave, v] of Object.entries(valor)) {
    salida[clave] = CLAVES_SECRETAS.test(clave)
      ? '[REDACTADO]'
      : redactarSyncLog(v, profundidad + 1)
  }
  return salida
}

/** Mensaje legible de un error de $fetch/Nitro, sin volcar el objeto entero. */
export function mensajeDeError(err) {
  if (!err) return null
  return String(
    err.data?.statusMessage
    || err.statusMessage
    || err.message
    || err
  ).slice(0, MAX_TEXTO)
}

function numero(valor) {
  return Number.isFinite(valor) ? Math.round(valor) : null
}

/**
 * Registra una traza. Devuelve true si se guardó, false si no (nunca lanza).
 */
export async function registrarSyncLog(entrada = {}) {
  try {
    const db = useDb()
    const datos = entrada.datos === undefined
      ? null
      : JSON.stringify(redactarSyncLog(entrada.datos)).slice(0, MAX_DATOS)

    await db.insert('sync_log', {
      id: nuevoId(),
      creadoEn: Date.now(),
      nivel: entrada.nivel === 'error' || entrada.nivel === 'warn' ? entrada.nivel : 'info',
      evento: String(entrada.evento ?? 'evento').slice(0, 60),
      tabla: entrada.tabla ? String(entrada.tabla).slice(0, 60) : null,
      loteId: entrada.loteId ? String(entrada.loteId).slice(0, 60) : null,
      filas: numero(entrada.filas),
      duracionMs: numero(entrada.duracionMs),
      http: numero(entrada.http),
      mensaje: entrada.mensaje ? String(entrada.mensaje).slice(0, MAX_TEXTO) : null,
      datos
    })

    await db.recortarTabla('sync_log', MAX_ENTRADAS)
    return true
  } catch {
    // La telemetría nunca debe romper la sincronización.
    return false
  }
}

export { MAX_ENTRADAS as MAX_ENTRADAS_SYNC_LOG }
