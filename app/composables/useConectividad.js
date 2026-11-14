/**
 * app/composables/useConectividad.js — Detección real de acceso a Internet.
 *
 * `hayRed` de `useSync()` solo dice si hay interfaz de red (WiFi/datos)
 * conectada, no si se puede alcanzar un servidor externo. Aquí comprobamos
 * conectividad real con una sonda ligera a `generate_204` (Google) y un
 * timeout corto, para decidir si usamos el motor Google (online) u offline.
 *
 * La sonda usa `mode: 'no-cors'`: el APK corre en `https://localhost`
 * (`androidScheme: "https"`) y `generate_204` no manda cabeceras CORS, así que
 * un `fetch` normal siempre se rechazaba y `hayInternet` quedaba en `false`.
 * Con `no-cors` la respuesta es opaca, pero la promesa resuelve si hubo salida
 * a la red; si falla, o el timeout aborta, no hay Internet.
 *
 * Estado: `hayInternet` es `null` hasta la primera comprobación, luego
 * `true` / `false`. Se reevalúa al arrancar, al cambiar la red y al volver a
 * primer plano; un dato de más de 30 s se vuelve a comprobar.
 */

import { ref } from 'vue'
import { Network } from '@capacitor/network'
import { App } from '@capacitor/app'
import {
  MS_TIMEOUT_SONDA,
  MS_VIGENCIA_INTERNET,
  datoInternetVigente,
  decidirInternet
} from '../utils/voice/conectividad'

const URL_COMPROBACION = 'https://clients3.google.com/generate_204'

const hayInternet = ref(null)

let comprobando = null
let ultimaComprobacion = 0
let iniciado = false

/**
 * Sonda `no-cors`. Devuelve `true` si resolvió, `false` si falló o expiró y
 * `null` si no existe `fetch` (no se puede sondear).
 */
async function sondar() {
  if (typeof fetch !== 'function') return null
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const temporizador = setTimeout(() => {
    try {
      ctrl?.abort()
    } catch {
      /* noop */
    }
  }, MS_TIMEOUT_SONDA)
  try {
    await fetch(URL_COMPROBACION, {
      mode: 'no-cors',
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl?.signal
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(temporizador)
  }
}

/** Interfaz de red según Capacitor (con tope propio, nunca bloquea la sonda). */
async function estadoRed() {
  try {
    return await Promise.race([
      Network.getStatus(),
      new Promise(resolve => setTimeout(() => resolve(null), 1000))
    ])
  } catch {
    return null
  }
}

async function medirInternet() {
  const [red, sonda] = await Promise.all([estadoRed(), sondar()])
  let onLine = null
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      onLine = navigator.onLine
    }
  } catch {
    onLine = null
  }
  return decidirInternet({
    redConectada: red && typeof red.connected === 'boolean' ? red.connected : null,
    sonda,
    onLine
  })
}

async function comprobarInternet({ forzar = false } = {}) {
  if (comprobando) return comprobando
  if (!forzar && datoInternetVigente(ultimaComprobacion)) return hayInternet.value
  comprobando = (async () => {
    let resultado = false
    try {
      resultado = await medirInternet()
    } catch {
      resultado = false
    }
    hayInternet.value = resultado
    ultimaComprobacion = Date.now()
    return resultado
  })()
  try {
    return await comprobando
  } finally {
    comprobando = null
  }
}

function cargarEstadoConectividad() {
  void comprobarInternet({ forzar: true })
  if (iniciado || typeof window === 'undefined') return
  iniciado = true

  // Cambio de red (WiFi ↔ datos ↔ sin red): volver a medir Internet real.
  try {
    const escucha = Network.addListener('networkStatusChange', () => {
      void comprobarInternet({ forzar: true })
    })
    if (escucha && typeof escucha.catch === 'function') escucha.catch(() => {})
  } catch {
    /* Network no disponible (navegador sin Capacitor) */
  }

  // Volver a primer plano: el estado pudo cambiar mientras la app dormía.
  try {
    const escucha = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void comprobarInternet({ forzar: true })
    })
    if (escucha && typeof escucha.catch === 'function') escucha.catch(() => {})
  } catch {
    /* App no disponible */
  }

  // Señales del navegador: `offline` es definitivo; `online` solo pide medir.
  window.addEventListener('offline', () => {
    hayInternet.value = false
    ultimaComprobacion = Date.now()
  })
  window.addEventListener('online', () => {
    void comprobarInternet({ forzar: true })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void comprobarInternet({ forzar: true })
  })
}

/**
 * Espera como máximo `timeoutMs` a conocer el estado real de Internet.
 * Si el dato es reciente devuelve al instante; si está viejo o no existe,
 * sondea y espera el resultado. Devuelve `null` si no se pudo confirmar.
 */
async function esperarInternet(timeoutMs = MS_TIMEOUT_SONDA + 500) {
  if (hayInternet.value !== null && datoInternetVigente(ultimaComprobacion)) {
    return hayInternet.value
  }
  const sonda = comprobarInternet({ forzar: hayInternet.value !== null })
  return await Promise.race([
    sonda,
    new Promise(resolve => setTimeout(() => resolve(hayInternet.value), timeoutMs))
  ])
}

/** Último resultado conocido (null = aún no se comprobó). */
function internetConocido() {
  return hayInternet.value
}

export {
  hayInternet,
  comprobarInternet,
  cargarEstadoConectividad,
  esperarInternet,
  internetConocido,
  MS_VIGENCIA_INTERNET
}
