import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Identidad del dispositivo.
 *
 * Se genera UNA vez por instalación (primer arranque) y se guarda en las
 * Preferences, así sobrevive a cierres de sesión y a reinicios. El servidor la
 * recibe en el header `x-dispositivo-id` y la usa para provisionar el equipo,
 * auditar accesos y permitir revocarlo desde el panel.
 *
 * No es un secreto: es solo un identificador estable. Por eso basta con
 * Preferences (que en Android vive en el sandbox de la app) y no SecureStorage.
 */

const PREF_DISPOSITIVO_ID = 'dispositivo_id'

let cacheId = null
let promesaId = null

function nuevoUuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // WebView sin crypto.randomUUID (contexto no seguro): se usa el fallback.
  }
  // RFC 4122 v4 armado a mano. Solo se llega aquí en entornos muy antiguos.
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Devuelve el id del dispositivo, creándolo la primera vez.
 * Cacheado en módulo: solo la primera llamada toca Preferences.
 */
export async function getDispositivoId() {
  if (cacheId) return cacheId
  if (promesaId) return promesaId

  promesaId = (async () => {
    try {
      const { value } = await Preferences.get({ key: PREF_DISPOSITIVO_ID })
      if (value) {
        cacheId = value
        return value
      }
    } catch {
      // Preferences no disponible: se genera uno para esta sesión.
    }

    const id = nuevoUuid()
    try {
      await Preferences.set({ key: PREF_DISPOSITIVO_ID, value: id })
    } catch {
      // Sin persistencia el id cambia al reiniciar; la app sigue funcionando.
    }
    cacheId = id
    return id
  })()

  try {
    return await promesaId
  } finally {
    // Si falló, permitir reintento en la próxima llamada.
    if (!cacheId) promesaId = null
  }
}

/**
 * Modelo y versión de Android deducidos del User-Agent del WebView.
 *
 * Evita añadir @capacitor/device solo para dos datos informativos: el UA de
 * Android trae `Android 13; SM-A125F Build/...`.
 */
export function infoDispositivo() {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent ?? '') : ''
  const android = ua.match(/Android\s+([\d.]+)/i)?.[1] ?? null
  const modelo = ua.match(/;\s*([^;)]+?)\s+Build\//i)?.[1]?.trim() ?? null

  return {
    plataforma: Capacitor.getPlatform(),
    android: android ? android.slice(0, 20) : null,
    modelo: modelo ? modelo.slice(0, 80) : null
  }
}
