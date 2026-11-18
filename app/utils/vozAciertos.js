import { Preferences } from '@capacitor/preferences'
import { API_ROUTES } from './api-paths'
import { telemetriaActiva } from './voice/telemetria'

const KEY = 'voz.aciertos.pendientes'
const MAX_PENDIENTES = 500
const MAX_LOTE = 200

function nuevoId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* noop */
  }
  // Respaldo para WebViews sin `randomUUID`: suficiente para deduplicar.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}

async function leer() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(a => a && typeof a.id === 'string') : []
  } catch {
    return []
  }
}

async function escribir(lista) {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(lista) })
  } catch {
    /* noop */
  }
}

/**
 * Best-effort: guarda un dictado que la app resolvió. Se sube en la próxima
 * sincronización. Sin telemetría activa en el equipo no se apunta nada.
 */
export async function registrarAciertoVoz(datos) {
  try {
    if (!(await telemetriaActiva())) return
    const comando = String(datos?.comando ?? '').trim().slice(0, 50)
    const resultado = String(datos?.resultado ?? '').trim().slice(0, 40)
    if (!comando || !resultado) return

    const acierto = {
      id: nuevoId(),
      comando,
      resultado,
      detalle: datos?.detalle ? String(datos.detalle).trim().slice(0, 200) : null,
      texto: datos?.texto ? String(datos.texto).trim().slice(0, 300) : null,
      confianza: typeof datos?.confianza === 'number' && Number.isFinite(datos.confianza)
        ? datos.confianza
        : null,
      creadoEn: new Date().toISOString()
    }

    const lista = await leer()
    // Dedupe por id: un reintento de la misma acción no crea dos filas.
    const mapa = new Map(lista.map(a => [a.id, a]))
    mapa.set(acierto.id, acierto)
    const recortada = Array.from(mapa.values()).slice(-MAX_PENDIENTES)
    await escribir(recortada)
  } catch {
    /* noop */
  }
}

export async function aciertosVozPendientes() {
  return leer()
}

/**
 * Sube hasta 200 pendientes y borra solo los que viajaron: un dictado nuevo
 * durante la subida no se pierde.
 */
export async function subirAciertosVozPendientes(fetch) {
  if (typeof fetch !== 'function') return 0
  const pendientes = await leer()
  if (!pendientes.length) return 0

  const lote = pendientes.slice(0, MAX_LOTE)
  try {
    const res = await fetch(API_ROUTES.vozAciertos, {
      method: 'POST',
      body: { aciertos: lote },
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res || res.ok === false) return 0

    const subidos = new Set(lote.map(a => a.id))
    const restantes = (await leer()).filter(a => !subidos.has(a.id))
    await escribir(restantes)
    return lote.length
  } catch {
    return 0
  }
}
