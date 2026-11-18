/**
 * app/composables/useConectividad.js — Detección real de acceso a Internet.
 *
 * `hayRed` de `useSync()` solo dice si hay interfaz de red (WiFi/datos)
 * conectada, no si se puede alcanzar un servidor externo. Aquí comprobamos
 * conectividad real con sondas ligeras a `generate_204` y decidimos si usamos
 * el motor Google (online) u offline.
 *
 * Detalles que importan en el APK:
 *
 * - `mode: 'no-cors'`: la app corre en `https://localhost` y `generate_204` no
 *   manda cabeceras CORS; un `fetch` normal siempre se rechazaba.
 * - Dos destinos en paralelo (`connectivitycheck.gstatic.com`, que es el que usa
 *   Android para marcar la red como VALIDATED, y `clients3`). Si uno está
 *   bloqueado por la red/VPN, el otro decide.
 * - Un **timeout no cuenta como «sin Internet»**: se marca como desconocido y,
 *   si la interfaz está conectada, se asume online. Medido en red móvil real:
 *   la sonda tarda 1,5–4,2 s, así que un timeout corto daba falsos negativos.
 * - La sonda **nunca bloquea** el arranque del micrófono: `esperarInternet()`
 *   devuelve el último dato conocido y la medición sigue en segundo plano.
 *
 * Estado: `hayInternet` es `null` hasta la primera medición, luego `true` /
 * `false`. Se reevalúa al arrancar, al cambiar la red, al volver a primer
 * plano, cuando el dato tiene más de 30 s y con un reintento rápido si la
 * medición quedó en duda.
 */

import { ref } from 'vue'
import { Network } from '@capacitor/network'
import { App } from '@capacitor/app'
import {
  MS_REINTENTO_INTERNET,
  MS_TIMEOUT_SONDA,
  MS_VIGENCIA_INTERNET,
  combinarSondas,
  datoInternetVigente,
  decidirInternet
} from '../utils/voice/conectividad'

// `connectivitycheck.gstatic.com` es el endpoint que usa Android para validar
// la red; `clients3` queda como respaldo.
const URLES_SONDA = [
  'https://connectivitycheck.gstatic.com/generate_204',
  'https://clients3.google.com/generate_204'
]

const hayInternet = ref(null)
// Última medición completa, para diagnóstico (`red.sonda` en la traza).
const ultimaSonda = ref(null)

let comprobando = null
let ultimaComprobacion = 0
let iniciado = false
let reintento = null

/**
 * Sonda `no-cors` a una URL.
 * Devuelve `true` si resolvió, `false` si falló de forma definitiva y `null`
 * si se abortó por timeout (desconocido) o no hay `fetch`.
 */
async function sondarUrl(url) {
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
    await fetch(url, {
      mode: 'no-cors',
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl?.signal
    })
    return true
  } catch {
    // Abortar es «no lo sé», no un «no hay red».
    return ctrl?.signal?.aborted ? null : false
  } finally {
    clearTimeout(temporizador)
  }
}

/** Sondea todos los destinos en paralelo y combina el resultado. */
async function sondarTodas() {
  const resultados = await Promise.all(URLES_SONDA.map(url => sondarUrl(url)))
  return combinarSondas(resultados)
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

/** Mide Internet real y devuelve el detalle para diagnosticar. */
async function medirInternet() {
  const inicio = Date.now()
  const [red, sonda] = await Promise.all([estadoRed(), sondarTodas()])
  const redConectada = red && typeof red.connected === 'boolean' ? red.connected : null
  let onLine = null
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      onLine = navigator.onLine
    }
  } catch {
    onLine = null
  }
  return {
    internet: decidirInternet({ redConectada, sonda, onLine }),
    sonda,
    red: redConectada,
    onLine,
    ms: Date.now() - inicio
  }
}

/** Un «sin red» con la sonda en duda y red conectada se reintenta pronto. */
function programarReintento(dato) {
  if (reintento) {
    clearTimeout(reintento)
    reintento = null
  }
  const dudoso = dato && !dato.internet && dato.sonda === null && dato.red !== false
  if (!dudoso) return
  reintento = setTimeout(() => {
    reintento = null
    void comprobarInternet({ forzar: true })
  }, MS_REINTENTO_INTERNET)
}

async function comprobarInternet({ forzar = false } = {}) {
  if (comprobando) return comprobando
  if (!forzar && datoInternetVigente(ultimaComprobacion)) return hayInternet.value
  comprobando = (async () => {
    let dato
    try {
      dato = await medirInternet()
    } catch {
      dato = { internet: false, sonda: null, red: null, onLine: null, ms: 0 }
    }
    hayInternet.value = dato.internet
    ultimaComprobacion = Date.now()
    ultimaSonda.value = { ...dato, medidoEn: ultimaComprobacion }
    try {
      console.log('[VOZDIAG-RED]', JSON.stringify(ultimaSonda.value))
    } catch {
      /* noop */
    }
    programarReintento(dato)
    return dato.internet
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
    ultimaSonda.value = {
      internet: false,
      sonda: null,
      red: false,
      onLine: false,
      ms: 0,
      medidoEn: ultimaComprobacion
    }
  })
  window.addEventListener('online', () => {
    void comprobarInternet({ forzar: true })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void comprobarInternet({ forzar: true })
  })
}

/**
 * Devuelve el estado de Internet para decidir motor, **sin bloquear**.
 *
 * - Dato reciente → se devuelve al instante.
 * - Primera vez (`null`) → se devuelve `null` (que ya resuelve a online) y la
 *   medición sigue en segundo plano. Antes se esperaban hasta 3 s aquí.
 * - Dato viejo en `true` → se devuelve `true` y se refresca en segundo plano.
 * - Dato viejo en `false` → se reintenta, con un tope corto de espera.
 */
async function esperarInternet(timeoutMs = 1000) {
  if (hayInternet.value === null) {
    void comprobarInternet()
    return null
  }
  if (datoInternetVigente(ultimaComprobacion)) return hayInternet.value
  if (hayInternet.value === true) {
    void comprobarInternet()
    return true
  }
  const sonda = comprobarInternet({ forzar: true })
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
  ultimaSonda,
  comprobarInternet,
  cargarEstadoConectividad,
  esperarInternet,
  internetConocido,
  MS_VIGENCIA_INTERNET
}
