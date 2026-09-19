import { Preferences } from '@capacitor/preferences'
import { Network } from '@capacitor/network'
import { $api } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import { push as pushOffline, pull as pullOffline } from '../server-offline/api/sync'
import { removePendingDeletesAccepted } from '../server-offline/api/_factory'
import { mergeFields } from '../utils/syncMerge.js'
import { SYNC_TABLES } from '../../shared/tables'

const TABLAS_SYNC = SYNC_TABLES.map(t => t.tabla)

const PREF_ULTIMA_SYNC = 'ultima_sincronizacion_en'

export function useSync() {
  const auth = useAuth()
  const toast = useToast()

  const sincronizando = ref(false)
  const ultimaSync = ref(null)
  const pendientesCount = ref(0)
  const hayRed = ref(true)

  function getHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  function fetch(path, options = {}) {
    return $api(path, {
      ...options,
      headers: { ...getHeaders(), ...options.headers }
    })
  }

  function repoDe(tabla) {
    const entity = SYNC_TABLES.find(t => t.tabla === tabla)
    if (!entity) {
      console.warn(`useSync.repoDe: no se encontró entity para tabla "${tabla}"`)
      return null
    }
    return useLocalRepo(entity)
  }

  let _networkListenerHandle = null

  async function cargarEstado() {
    const stored = await Preferences.get({ key: PREF_ULTIMA_SYNC })
    if (stored.value) ultimaSync.value = Number(stored.value)

    await actualizarPendientesCount()

    try {
      const status = await Network.getStatus()
      hayRed.value = status.connected
    } catch {
      hayRed.value = true
    }

    if (_networkListenerHandle) return
    try {
      const handle = await Network.addListener('networkStatusChange', (s) => {
        hayRed.value = s.connected
      })
      _networkListenerHandle = handle
    } catch {
      // Network no disponible (navegador / SSR)
    }
  }

  async function _ejecutarPull() {
    const desde = ultimaSync.value ?? 0
    const pullResult = await fetch(API_ROUTES.syncPull + '?desde=' + desde)
    await pullOffline(pullResult, {}, null)

    const ahora = pullResult.timestamp_servidor ?? Date.now()
    ultimaSync.value = ahora
    await Preferences.set({ key: PREF_ULTIMA_SYNC, value: String(ahora) })

    return pullResult
  }

  async function sincronizarAhora() {
    if (!auth.sesionLocalVigente()) {
      toast.add({
        title: 'Sesión expirada',
        description: 'Vuelve a iniciar sesión para sincronizar.',
        color: 'warning'
      })
      await auth.invalidarSesionLocal()
      await navigateTo('/login')
      return false
    }

    if (!hayRed.value) {
      toast.add({
        title: 'Sin conexión',
        description: 'No hay red disponible para sincronizar.',
        color: 'error'
      })
      return false
    }

    if (!auth.jwtSync.value) {
      toast.add({
        title: 'Reautenticación',
        description: 'Necesitas volver a iniciar sesión para sincronizar.',
        color: 'warning'
      })
      await auth.logout()
      await navigateTo('/login')
      return false
    }

    sincronizando.value = true
    try {
      const pendientes = await pushOffline({}, null)

      const pushResult = await fetch(API_ROUTES.syncPush, { method: 'POST', body: pendientes })

      await marcarAceptados(pushResult.aceptados, pendientes)
      await absorberConflictos(pushResult.conflictos)
      if (pushResult.deletesAceptados?.length) {
        await removePendingDeletesAccepted(pushResult.deletesAceptados)
      }

      for (let intento = 0; intento < 2; intento++) {
        try {
          await _ejecutarPull()
          break
        } catch (pullErr) {
          if (intento === 1) throw pullErr
        }
      }

      return true
    } catch (err) {
      toast.add({
        title: 'Error en sincronización',
        description:
          err.data?.statusMessage
          || err.statusMessage
          || err.message
          || 'Error desconocido.',
        color: 'error'
      })
      return false
    } finally {
      sincronizando.value = false
      await actualizarPendientesCount()
    }
  }

  async function pullServidor({ silent = false } = {}) {
    if (!auth.sesionLocalVigente()) {
      if (!silent) {
        toast.add({
          title: 'Sesión expirada',
          description: 'Vuelve a iniciar sesión para sincronizar.',
          color: 'warning'
        })
      }
      return false
    }

    if (!hayRed.value) {
      return false
    }

    if (!auth.jwtSync.value) {
      return false
    }

    sincronizando.value = true
    try {
      await _ejecutarPull()
      return true
    } catch (err) {
      if (!silent) {
        toast.add({
          title: 'Error en sincronización',
          description:
            err.data?.statusMessage
            || err.statusMessage
            || err.message
            || 'Error desconocido.',
          color: 'error'
        })
      }
      return false
    } finally {
      sincronizando.value = false
      await actualizarPendientesCount()
    }
  }

  async function marcarAceptados(aceptados, pendientes) {
    if (!aceptados?.length) return
    const idsSet = new Set(aceptados)
    for (const t of TABLAS_SYNC) {
      const rows = pendientes[t]
      if (!rows?.length) continue
      const repo = repoDe(t)
      if (!repo) continue
      for (const reg of rows) {
        if (idsSet.has(reg.id)) {
          try {
            await repo.update(reg.id, { sincronizado: 1 })
          } catch {
            // eliminar error eslint
          }
        }
      }
    }
  }

  async function absorberConflictos(conflictos) {
    if (!conflictos) return
    for (const [tabla, conflictosTabla] of Object.entries(conflictos)) {
      if (!conflictosTabla?.length) continue
      const repo = repoDe(tabla)
      if (!repo) continue
      for (const conflicto of conflictosTabla) {
        try {
          const server = conflicto.server ?? conflicto
          const client = conflicto.client ?? conflicto
          const { merged, difiereDelServidor } = mergeFields(server, client)
          // Si el merge aporta datos que el servidor no tenía (null→valor
          // del cliente), se marca no-sincronizado y se refresca el
          // timestamp para que el próximo push lo suba.
          const patch = difiereDelServidor
            ? { ...merged, actualizadoEn: Date.now(), sincronizado: 0 }
            : { ...merged, sincronizado: 1 }
          await repo.update(merged.id, patch)
        } catch {
          // absorber conflicto best-effort
        }
      }
    }
  }

  async function actualizarPendientesCount(pendientesYaCalculados = null) {
    const pendientes = pendientesYaCalculados ?? (await pushOffline({}, null))
    pendientesCount.value = TABLAS_SYNC.reduce(
      (s, t) => s + (pendientes[t]?.length ?? 0),
      0
    )
  }

  async function descargarCatalogo() {
    try {
      const data = await fetch(API_ROUTES.syncProductosActivos)
      const productoConfig = SYNC_TABLES.find(t => t.tabla === 'productos')
      const repo = useLocalRepo(productoConfig)
      const existentes = await repo.readAll()

      for (const prod of data) {
        const existing = existentes.find(e => e.id === prod.id)
        if (existing) {
          await repo.update(prod.id, { ...prod, sincronizado: 1 })
        } else {
          await repo.create({ ...prod, sincronizado: 1 })
        }
      }
    } catch (err) {
      toast.add({
        title: 'Error',
        description: err.data?.statusMessage || err.message,
        color: 'error'
      })
    }
  }

  return {
    sincronizando: readonly(sincronizando),
    ultimaSync: readonly(ultimaSync),
    pendientesCount: readonly(pendientesCount),
    hayRed: readonly(hayRed),
    cargarEstado,
    sincronizarAhora,
    pullServidor,
    fetchPull: desde => fetch(API_ROUTES.syncPull + '?desde=' + desde),
    descargarCatalogo,
    aplicarPull: pullOffline
  }
}

// mergeFields re-export removed to avoid Nuxt auto-import duplicate warning;
// import directly from '~/utils/syncMerge' where needed.
