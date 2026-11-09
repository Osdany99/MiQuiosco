import { Preferences } from '@capacitor/preferences'
import { API_ROUTES } from './api-paths'

const KEY = 'voz.eventos.pendientes'
const MAX_INTENTOS = 100000

async function leer() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return {}
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return {}
  } catch {
    return {}
  }
}

async function escribir(mapa) {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(mapa) })
  } catch {
    /* noop */
  }
}

function clave(comando, motivo, plantilla) {
  return `${String(comando ?? '')}|${String(motivo ?? '')}|${plantilla ?? ''}`
}

/**
 * Best-effort: registra un evento no reconocido por motivo. Agrega al contador.
 */
export async function registrarEventoVoz(datos) {
  try {
    const comando = String(datos?.comando ?? 'desconocido')
    const motivo = String(datos?.motivo ?? '')
    if (!motivo) return
    // Plantilla (enmascarada) para persistir vocabulario sin exponer datos.
    let plantilla = datos?.plantilla ? String(datos.plantilla).trim().slice(0, 120) : ''
    if (!plantilla && datos?.transcript) {
      try {
        const { enmascarar: enm } = await import('#shared/voz/privacidad')
        plantilla = enm(datos.transcript, {
          palabrasProducto: datos.palabrasProducto || new Set(),
          palabrasCliente: datos.palabrasCliente || new Set()
        })
      } catch {
        plantilla = ''
      }
    }
    plantilla = plantilla || null
    const mapa = await leer()
    const k = clave(comando, motivo, plantilla)
    const prev = (mapa[k] && typeof mapa[k] === 'object') ? mapa[k] : { intentos: 0, confianza: null, plantilla }
    const intentos = Math.min(MAX_INTENTOS, Number(prev.intentos || 0) + 1)
    const confianza = (typeof datos?.confianza === 'number' && Number.isFinite(datos.confianza))
      ? datos.confianza
      : prev.confianza
    mapa[k] = { intentos, confianza, plantilla }
    await escribir(mapa)
  } catch {
    /* noop */
  }
}

export async function eventosVozPendientes() {
  const mapa = await leer()
  return Object.entries(mapa).map(([k, v]) => {
    const first = k.indexOf('|')
    const second = k.indexOf('|', first + 1)
    const comando = first >= 0 ? k.slice(0, first) : k
    const motivo = first >= 0 && second >= 0 ? k.slice(first + 1, second) : (first >= 0 ? k.slice(first + 1) : '')
    const plantillaRaw = second >= 0 ? k.slice(second + 1) : ''
    const plantilla = plantillaRaw || (v && v.plantilla) || null
    return {
      comando: comando || 'desconocido',
      motivo: motivo || '',
      plantilla,
      confianza: (v && typeof v.confianza === 'number') ? v.confianza : null,
      intentos: Math.max(1, Number(v?.intentos) || 1)
    }
  }).filter(e => e.motivo)
}

export async function marcarEventosVozSubidos() {
  try {
    await Preferences.remove({ key: KEY })
  } catch {
    /* noop */
  }
}

export async function subirEventosVozPendientes(fetch) {
  if (typeof fetch !== 'function') return 0
  const pendientes = await eventosVozPendientes()
  if (!pendientes.length) return 0
  try {
    const res = await fetch(API_ROUTES.vozEventos, {
      method: 'POST',
      body: { eventos: pendientes },
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res || res.ok === false) return 0
    await marcarEventosVozSubidos()
    return pendientes.length
  } catch {
    return 0
  }
}
