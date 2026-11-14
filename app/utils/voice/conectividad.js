/**
 * app/utils/voice/conectividad.js — decisión de conectividad real (puro).
 *
 * La sonda (fetch / Capacitor Network) vive en `useConectividad`; aquí queda
 * solo la regla para poder probarla con `node --test`.
 */

/** Tiempo máximo de una sonda antes de darla por fallida. */
export const MS_TIMEOUT_SONDA = 2500
/** Un dato de conectividad más viejo que esto se vuelve a comprobar. */
export const MS_VIGENCIA_INTERNET = 30_000

/**
 * Decide si hay Internet real.
 *
 * - `redConectada`: interfaz de red (Capacitor Network). `false` es definitivo.
 * - `sonda`: resultado del fetch `no-cors`. `true` resolvió, `false` falló,
 *   `null` no se pudo ejecutar (sin `fetch`).
 * - `onLine`: `navigator.onLine` como último apoyo.
 */
export function decidirInternet({ redConectada = null, sonda = null, onLine = null } = {}) {
  // Sin interfaz de red no hay nada que sondear.
  if (redConectada === false) return false
  // La sonda es la verdad: resolvió = hay salida a Internet; falló = no hay.
  if (sonda === true) return true
  if (sonda === false) return false
  // No se pudo sondear: se confía en la interfaz y, en su defecto, en onLine.
  if (redConectada !== null) return Boolean(redConectada)
  if (onLine !== null) return Boolean(onLine)
  return false
}

/** `true` si el último dato se puede reutilizar sin volver a sondear. */
export function datoInternetVigente(ultimaMs, ahora = Date.now(), vigenciaMs = MS_VIGENCIA_INTERNET) {
  if (!Number.isFinite(ultimaMs) || ultimaMs <= 0) return false
  return ahora - ultimaMs < vigenciaMs
}
