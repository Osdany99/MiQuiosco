import { Preferences } from '@capacitor/preferences'
import { serverAlcanzable } from '../utils/api'

const PREF_MODO = 'modo_conexion'

const modo = ref('local')
const transicionando = ref(false)

let _watcherInstalled = false

export function useModoConexion() {
  const auth = useAuth()
  const toast = useToast()

  if (!_watcherInstalled) {
    _watcherInstalled = true
    let fallosConsecutivos = 0

    watch(serverAlcanzable, (alcanzable) => {
      if (alcanzable) {
        fallosConsecutivos = 0
        return
      }
      fallosConsecutivos++
      if (fallosConsecutivos >= 2 && modo.value === 'online') {
        fallosConsecutivos = 0
        modo.value = 'local'
        Preferences.set({ key: PREF_MODO, value: 'local' })
      }
    })
  }

  async function cargar() {
    const stored = await Preferences.get({ key: PREF_MODO })
    if (stored.value === 'online' || stored.value === 'local') {
      modo.value = stored.value
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
      await Preferences.set({ key: PREF_MODO, value: 'online' })
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
      const pullResult = await sync.remoteApi.syncPull(desde)
      await sync.aplicarPull(pullResult)
      modo.value = 'local'
      await Preferences.set({ key: PREF_MODO, value: 'local' })
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
