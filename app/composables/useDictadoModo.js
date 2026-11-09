import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { ref } from 'vue'

const PREF = 'voice.pushToTalk'

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function readPrefSync() {
  try {
    if (isNative()) return null
    return localStorage.getItem(PREF)
  } catch {
    return null
  }
}

async function readPrefAsync() {
  if (isNative()) {
    try {
      const { value } = await Preferences.get({ key: PREF })
      return value ?? null
    } catch {
      return null
    }
  }
  return readPrefSync()
}

function writePref(value) {
  const str = String(value)
  if (isNative()) {
    void Preferences.set({ key: PREF, value: str }).catch(() => {})
  } else {
    try {
      localStorage.setItem(PREF, str)
    } catch {
      /* noop */
    }
  }
}

let singleton = null

function _create() {
  const pushToTalk = ref(false)
  let cargado = false

  async function cargar() {
    if (cargado) return
    const valor = await readPrefAsync()
    if (valor === 'true' || valor === 'false') {
      pushToTalk.value = valor === 'true'
    }
    cargado = true
  }

  function set(value) {
    pushToTalk.value = Boolean(value)
    writePref(pushToTalk.value)
  }

  // Carga perezosa en cliente (no en SSR).
  if (import.meta.client) {
    void cargar()
  }

  return { pushToTalk, set, cargar }
}

export function useDictadoModo() {
  if (!singleton) singleton = _create()
  return singleton
}
