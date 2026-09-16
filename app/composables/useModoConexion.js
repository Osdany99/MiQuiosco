import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { serverAlcanzable } from '../utils/api'

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
    let fallosConsecutivos = 0

    watch(serverAlcanzable, (alcanzable) => {
      if (alcanzable) {
        fallosConsecutivos = 0
        if (modo.value === 'local') {
          cambiarAOnline().catch(() => {})
        }
        return
      }
      fallosConsecutivos++
      if (fallosConsecutivos >= 2 && modo.value === 'online') {
        fallosConsecutivos = 0
        modo.value = 'local'
        writePref(PREF_MODO, 'local')
      }
    })
  }

  async function cargar() {
    const value = await readPrefAsync(PREF_MODO)
    if (value === 'online' || value === 'local') {
      modo.value = value
    }
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
      toast.add({ title: 'Modo online activado', description: 'Los cambios se guardan directamente en el servidor.', color: 'success' })
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
      toast.add({ title: 'Modo local activado', description: 'Los cambios se guardan localmente hasta sincronizar.', color: 'success' })
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
