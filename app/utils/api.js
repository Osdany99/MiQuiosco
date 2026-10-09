import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { shallowRef, readonly } from 'vue'

const PREF_API_BASE = 'api_base_url'
const TIMEOUT_MS = 15000
const HEADER_VERSION_CODE = 'x-app-version-code'

let cachedBase = undefined
let cachedVersionCode = undefined
let versionCodePromise = null

const _serverAlcanzable = shallowRef(true)
export const serverAlcanzable = readonly(_serverAlcanzable)

// Contador de fallos de red CONSECUTIVOS (se resetea con cada exito).
// Existe porque un watch sobre el booleano solo dispara en las transiciones
// true->false: con el servidor caido el valor se queda en false y el contador
// del watcher nunca llegaba a 2, asi que la degradacion automatica a Local
// jamas ocurria. Este contador sube con CADA fallo.
const _fallosRed = shallowRef(0)
export const fallosRed = readonly(_fallosRed)

export function esErrorDeRed(err) {
  if (!err || typeof err !== 'object') return false
  if (err.name === 'AbortError') return true
  if (!err.response && !err.status) return true
  return false
}

export function setInitialBaseUrl(url) {
  if (cachedBase === undefined) cachedBase = url || null
}

export async function getApiBaseUrl() {
  if (cachedBase !== undefined) return cachedBase

  if (Capacitor.isNativePlatform()) {
    try {
      const stored = await Preferences.get({ key: PREF_API_BASE })
      if (stored.value) {
        cachedBase = stored.value
        return cachedBase
      }
    } catch { /* fall through to env default */ }
  }
  cachedBase = null
  return cachedBase
}

export async function setApiBaseUrl(url) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.set({ key: PREF_API_BASE, value: url })
    } catch { /* preferencias no disponibles — seguimos sin guardar */ }
  }
  cachedBase = url
}

/**
 * versionCode de la APK instalada (entero de android/app/build.gradle).
 * Solo en nativo; en web devuelve null. Se cachea tras la primera lectura.
 */
export async function getAppVersionCode() {
  if (cachedVersionCode !== undefined) return cachedVersionCode
  if (versionCodePromise) return versionCodePromise
  versionCodePromise = (async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        cachedVersionCode = null
        return null
      }
      const { App } = await import('@capacitor/app')
      const info = await App.getInfo()
      const code = Number(info?.build)
      cachedVersionCode = Number.isFinite(code) ? code : null
    } catch {
      cachedVersionCode = null
    }
    return cachedVersionCode
  })()
  return versionCodePromise
}

let cachedVersionNombre = undefined

/**
 * versionName de la APK instalada (ej. "1.0"). Solo informativo.
 */
export async function getAppVersionNombre() {
  if (cachedVersionNombre !== undefined) return cachedVersionNombre
  try {
    if (!Capacitor.isNativePlatform()) {
      cachedVersionNombre = null
      return null
    }
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    cachedVersionNombre = info?.version ?? null
  } catch {
    cachedVersionNombre = null
  }
  return cachedVersionNombre
}

export async function $api(path, opts = {}) {
  const baseUrl = await getApiBaseUrl()
  const url = baseUrl
    ? `${baseUrl.replace(/\/+$/, '')}${path}`
    : path

  // La APK instalada se identifica ante el servidor para que este pueda
  // rechazar (426) versiones obsoletas. En web no se envía el header.
  const versionCode = await getAppVersionCode()
  const versionHeaders = versionCode != null
    ? { [HEADER_VERSION_CODE]: String(versionCode) }
    : {}

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  // Cancelación del usuario (p. ej. botón "Cancelar sincronización"): se
  // propaga la señal externa al controlador del timeout. En el catch se
  // marca el error para no contarlo como fallo de red.
  const externa = opts.signal
  let quitarOyente = null
  if (externa) {
    if (externa.aborted) {
      controller.abort()
    } else {
      const alAbortar = () => controller.abort()
      externa.addEventListener('abort', alAbortar, { once: true })
      quitarOyente = () => externa.removeEventListener('abort', alAbortar)
    }
  }

  try {
    const result = await $fetch(url, {
      ...opts,
      headers: { ...versionHeaders, ...opts.headers },
      signal: controller.signal
    })
    _serverAlcanzable.value = true
    _fallosRed.value = 0
    return result
  } catch (err) {
    if (externa?.aborted) {
      err.cancelacionUsuario = true
      throw err
    }
    if (esErrorDeRed(err)) {
      _serverAlcanzable.value = false
      _fallosRed.value += 1
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    quitarOyente?.()
  }
}
