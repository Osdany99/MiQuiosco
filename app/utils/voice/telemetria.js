import { Preferences } from '@capacitor/preferences'

const KEY = 'voz.telemetria.activa'
const DEFAULT = true

function leerLocal() {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(KEY)
      if (v === 'true' || v === 'false') return v === 'true'
    }
  } catch {
    /* noop */
  }
  return null
}

export async function fijarTelemetria(valor) {
  const v = Boolean(valor)
  try {
    await Preferences.set({ key: KEY, value: String(v) })
  } catch {
    /* noop */
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(v))
  } catch {
    /* noop */
  }
  return v
}

export async function telemetriaActiva() {
  let found = null
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (value === 'true' || value === 'false') found = value === 'true'
  } catch {
    /* noop */
  }
  if (found === null) found = leerLocal()
  if (found === null) return DEFAULT
  return found
}

export function telemetriaActivaSync() {
  const v = leerLocal()
  if (v !== null) return v
  return DEFAULT
}
