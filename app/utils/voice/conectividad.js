/**
 * app/utils/voice/conectividad.js — decisión de conectividad real (puro).
 *
 * La sonda (fetch / Capacitor Network) vive en `useConectividad`; aquí queda
 * solo la regla para poder probarla con `node --test`.
 *
 * Regla clave: un **timeout no es prueba de que no haya Internet**. En redes
 * lentas (datos móviles, VPN) la sonda tarda más que el timeout y se aborta;
 * tratarlo como «sin red» hacía que el modo automático eligiera siempre el
 * motor offline aunque hubiera conexión.
 */

/**
 * Tiempo máximo de una sonda. Es holgado a propósito: la sonda corre en
 * segundo plano y ya no bloquea el arranque del micrófono.
 */
export const MS_TIMEOUT_SONDA = 7000
/** Un dato de conectividad más viejo que esto se vuelve a comprobar. */
export const MS_VIGENCIA_INTERNET = 30_000
/** Si la sonda quedó en duda con red conectada, se reintenta tras esto. */
export const MS_REINTENTO_INTERNET = 5000

/**
 * Combina varias sondas en paralelo.
 *
 * - Si alguna respondió → hay Internet.
 * - Si ninguna respondió pero alguna quedó en duda (timeout) → desconocido.
 * - Solo si **todas** fallaron de forma definitiva → no hay Internet.
 */
export function combinarSondas(resultados = []) {
  const lista = Array.isArray(resultados) ? resultados : []
  if (lista.length === 0) return null
  if (lista.some(resultado => resultado === true)) return true
  // Solo es «no hay Internet» si todas fallaron de forma definitiva.
  if (lista.every(resultado => resultado === false)) return false
  return null
}

/**
 * Decide si hay Internet real.
 *
 * - `redConectada`: interfaz de red (Capacitor Network). `false` es definitivo.
 * - `sonda`: resultado de las sondas `no-cors`:
 *     `true`  → alguna resolvió (hay salida a Internet).
 *     `false` → todas fallaron de forma definitiva (DNS, red rechazada…).
 *     `null`  → no se pudo determinar (timeout, aborto, sin `fetch`).
 * - `onLine`: `navigator.onLine` como último apoyo.
 */
export function decidirInternet({ redConectada = null, sonda = null, onLine = null } = {}) {
  // Sin interfaz de red no hay nada que sondear.
  if (redConectada === false) return false
  // Una sonda que resolvió es la prueba positiva.
  if (sonda === true) return true
  // Un rechazo definitivo de todas las sondas gana sobre la interfaz.
  if (sonda === false) return false
  // Desconocido (timeout): con la interfaz conectada se asume online; es
  // preferible equivocarse hacia online que degradar a offline sin motivo.
  if (redConectada === true) return true
  if (onLine !== null) return Boolean(onLine)
  return false
}

/** `true` si el último dato se puede reutilizar sin volver a sondear. */
export function datoInternetVigente(ultimaMs, ahora = Date.now(), vigenciaMs = MS_VIGENCIA_INTERNET) {
  if (!Number.isFinite(ultimaMs) || ultimaMs <= 0) return false
  return ahora - ultimaMs < vigenciaMs
}
