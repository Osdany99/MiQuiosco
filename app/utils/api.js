import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { shallowRef, readonly } from 'vue'

const PREF_API_BASE = 'api_base_url'
const TIMEOUT_MS = 5000

let cachedBase = undefined

const _serverAlcanzable = shallowRef(true)
export const serverAlcanzable = readonly(_serverAlcanzable)

export function esErrorDeRed(err) {
  if (!err || typeof err !== 'object') return false
  if (err.name === 'AbortError') return true
  if (!err.response && !err.status) return true
  return false
}

export async function getApiBaseUrl() {
  if (cachedBase !== undefined) return cachedBase

  if (Capacitor.isNativePlatform()) {
    // App empaquetada (Android/iOS): no hay "origen actual" al que pegarle,
    // así que sí necesitamos una URL absoluta (IP de la laptop en la LAN).
    try {
      const stored = await Preferences.get({ key: PREF_API_BASE })
      if (stored.value) {
        cachedBase = stored.value
        return cachedBase
      }
    } catch { /* fall through to env default */ }

    const config = useRuntimeConfig()
    cachedBase = config.public.syncServerUrl || null
    return cachedBase
  }

  // Web (navegador, dev o build web): el mismo Nitro sirve frontend + API,
  // así que usamos rutas relativas y dejamos que $fetch pegue al origen
  // actual (localhost:3000 en tu laptop, o la IP si accedes desde otro
  // dispositivo por la red). Ignoramos NUXT_PUBLIC_SYNC_SERVER_URL aquí:
  // esa variable es solo para el build nativo.
  cachedBase = null
  return cachedBase
}

export async function setApiBaseUrl(url) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.set({ key: PREF_API_BASE, value: url })
    } catch {}
  }
  cachedBase = url
}

export async function $api(path, opts = {}) {
  const baseUrl = await getApiBaseUrl()
  const url = baseUrl
    ? `${baseUrl.replace(/\/+$/, '')}${path}`
    : path

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const result = await $fetch(url, {
      ...opts,
      signal: controller.signal
    })
    _serverAlcanzable.value = true
    return result
  } catch (err) {
    if (esErrorDeRed(err)) {
      _serverAlcanzable.value = false
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
