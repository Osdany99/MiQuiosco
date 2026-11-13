/**
 * app/composables/useConectividad.js — Detección real de acceso a Internet.
 *
 * `hayRed` de `useSync()` solo dice si hay interfaz de red (WiFi/datos)
 * conectada, no si se puede alcanzar un servidor externo. Aquí comprobamos
 * conectividad real con una petición ligera a `generate_204` (Google) y un
 * timeout corto, para decidir si usamos el motor Google (online) o Vosk
 * (offline empaquetado).
 *
 * Estado: `hayInternet` es `null` hasta la primera comprobación, luego
 * `true` / `false`. Se reevalúa al arrancar y cada vez que cambia la red.
 */

import { Network } from '@capacitor/network'

const hayInternet = ref(null)
let comprobando = false

const URL_COMPROBACION = 'https://clients3.google.com/generate_204'
const TIEMPO_ESPERA_MS = 4000

async function comprobarInternet() {
  if (comprobando) return hayInternet.value === true
  comprobando = true
  try {
    const ctrl = new AbortController()
    const temporizador = setTimeout(() => ctrl.abort(), TIEMPO_ESPERA_MS)
    const respuesta = await fetch(URL_COMPROBACION, {
      method: 'HEAD',
      cache: 'no-store',
      signal: ctrl.signal
    })
    clearTimeout(temporizador)
    // generate_204 responde 204 No Content si hay acceso a Internet.
    const ok = respuesta.status === 204
    hayInternet.value = ok
    return ok
  } catch {
    hayInternet.value = false
    return false
  } finally {
    comprobando = false
  }
}

function cargarEstadoConectividad() {
  void comprobarInternet()
  if (typeof window === 'undefined') return
  Network.addListener('networkStatusChange', () => {
    // La red cambió: vuelva a comprobar acceso real (no solo interfaz).
    void comprobarInternet()
  }).catch(() => {
    // Network no disponible (SSR / navegador sin Capacitor)
  })
}

/** Último resultado conocido (null = aún no se comprobó). */
function internetConocido() {
  return hayInternet.value
}

export { hayInternet, comprobarInternet, cargarEstadoConectividad, internetConocido }
