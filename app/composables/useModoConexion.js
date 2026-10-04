import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { fallosRed } from '../utils/api'

const PREF_MODO = 'modo_conexion'

const modo = ref('local')
const transicionando = ref(false)

let _watcherInstalled = false

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function readPref(key) {
  try {
    if (isNative()) return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function readPrefAsync(key) {
  if (isNative()) {
    try {
      const v = await Preferences.get({ key })
      return v.value ?? null
    } catch {
      return null
    }
  }
  return readPref(key)
}

function writePref(key, value) {
  try {
    if (isNative()) {
      Preferences.set({ key, value }).catch(() => {})
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    /* noop */
  }
}

export function useModoConexion() {
  const auth = useAuth()
  const toast = useToast()

  if (!_watcherInstalled) {
    _watcherInstalled = true

    // Se observa el CONTADOR (dispara con cada fallo), no el booleano
    // (solo dispara en la transicion true->false y la degradacion nunca
    // llegaba con el servidor caido de forma sostenida).
    watch(fallosRed, (fallos) => {
      if (fallos === 0) {
        if (modo.value === 'local') {
          cambiarAOnline().catch(() => {})
        }
        return
      }
      if (fallos >= 2 && modo.value === 'online') {
        modo.value = 'local'
        writePref(PREF_MODO, 'local')
      }
    })
  }

  async function cargar() {
    const value = await readPrefAsync(PREF_MODO)
    if (value === 'online' || value === 'local') {
      modo.value = value
      return
    }
    // Sin preferencia guardada: en web (no Capacitor) siempre hay red y el
    // sqlite local es in-memory (se pierde al recargar), así que usamos
    // online por defecto. En Android se conserva el default local
    // (offline-first, sqlite persistente).
    modo.value = isNative() ? 'local' : 'online'
  }

  async function cambiarAOnline() {
    if (!auth.esJefe.value) return false
    const sync = useSync()
    transicionando.value = true
    try {
      const ok = await sync.sincronizarAhora()
      if (!ok) {
        toast.add({ title: 'No se puede cambiar a online', description: 'Resuelve los errores de sincronización primero.', color: 'error' })
        return false
      }
      modo.value = 'online'
      writePref(PREF_MODO, 'online')
      return true
    } finally {
      transicionando.value = false
    }
  }

  async function cambiarALocal() {
    if (!auth.esJefe.value) return false
    const sync = useSync()
    transicionando.value = true
    try {
      const desde = sync.ultimaSync.value ?? 0
      const pullResult = await sync.fetchPull(desde)
      await sync.aplicarPull(pullResult)
      modo.value = 'local'
      writePref(PREF_MODO, 'local')
      return true
    } catch (err) {
      toast.add({ title: 'Error al volver a local', description: err.message || 'No se pudo descargar datos del servidor.', color: 'error' })
      return false
    } finally {
      transicionando.value = false
    }
  }

  async function toggle() {
    if (modo.value === 'online') return cambiarALocal()
    return cambiarAOnline()
  }

  return {
    modo: readonly(modo),
    transicionando: readonly(transicionando),
    cargar,
    cambiarAOnline,
    cambiarALocal,
    toggle
  }
}
