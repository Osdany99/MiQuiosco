import { Preferences } from '@capacitor/preferences'
import { Network } from '@capacitor/network'
import { ENTIDADES } from '~/config/entidades'

const PREF_ULTIMA_SYNC = 'ultima_sincronizacion_en'
const TABLAS_SYNC = Object.entries(ENTIDADES)
  .filter(([, def]) => def.sync)
  .map(([tabla]) => tabla)

export function useSync() {
  const auth = useAuth()
  const remoteApi = useRemoteApi()
  const toast = useToast()

  const sincronizando = ref(false)
  const ultimaSync = ref(null)
  const pendientesCount = ref(0)
  const hayRed = ref(true)

  function repoDe(tabla) {
    return useLocalRepo(tabla)
  }

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

    try {
      Network.addListener('networkStatusChange', (s) => {
        hayRed.value = s.connected
      })
    } catch {}
  }

  /**
   * Ejecuta solo el pull (sin push). Reutilizado por sincronizarAhora() y
   * pullServidor(). Asume que los guards (sesión, red, JWT) ya pasaron.
   */
  async function _ejecutarPull() {
    const desde = ultimaSync.value ?? 0
    const pullResult = await remoteApi.syncPull(desde)
    await aplicarPull(pullResult)

    const ahora = pullResult.timestamp_servidor ?? Date.now()
    ultimaSync.value = ahora
    await Preferences.set({ key: PREF_ULTIMA_SYNC, value: String(ahora) })

    return pullResult
  }

  async function sincronizarAhora() {
    if (!auth.sesionLocalVigente()) {
      toast.add({ title: 'Sesión expirada', description: 'Vuelve a iniciar sesión para sincronizar.', color: 'warning' })
      await auth.invalidarSesionLocal()
      await navigateTo('/login')
      return false
    }

    if (!hayRed.value) {
      toast.add({ title: 'Sin conexión', description: 'No hay red disponible para sincronizar.', color: 'error' })
      return false
    }

    if (!auth.jwtSync.value) {
      toast.add({ title: 'Reautenticación', description: 'Necesitas volver a iniciar sesión para sincronizar.', color: 'warning' })
      await auth.logout()
      await navigateTo('/login')
      return false
    }

    sincronizando.value = true
    try {
      const pendientes = await reunirPendientes()

      const pushResult = await remoteApi.syncPush(pendientes)

      // pushResult.aceptados — flat string[] de IDs aceptados
      await marcarAceptados(pushResult.aceptados, pendientes)

      // pushResult.conflictos — { productos: [], historial_precios: [], ... }
      await absorberConflictos(pushResult.conflictos)

      const pullResult = await _ejecutarPull()

      const totalRecibidos = TABLAS_SYNC.reduce((s, t) => s + (pullResult[t]?.length ?? 0), 0)
      toast.add({
        title: 'Sincronización completada',
        description: `Subidos: ${pushResult.aceptados?.length ?? 0}, Recibidos: ${totalRecibidos}`,
        color: 'success'
      })
      return true
    } catch (err) {
      toast.add({
        title: 'Error en sincronización',
        description: err.data?.statusMessage || err.statusMessage || err.message || 'Error desconocido.',
        color: 'error'
      })
      return false
    } finally {
      sincronizando.value = false
      await actualizarPendientesCount()
    }
  }

  /**
   * Solo pull (sin push), con toasts opcionales.
   * Útil para triggers automáticos post-login o post-cambio-de-PIN donde
   * solo se necesita hidratar el caché local, no subir datos.
   */
  async function pullServidor({ silent = false } = {}) {
    if (!auth.sesionLocalVigente()) {
      if (!silent) {
        toast.add({ title: 'Sesión expirada', description: 'Vuelve a iniciar sesión para sincronizar.', color: 'warning' })
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
      const pullResult = await _ejecutarPull()

      if (!silent) {
        const totalRecibidos = TABLAS_SYNC.reduce((s, t) => s + (pullResult[t]?.length ?? 0), 0)
        toast.add({
          title: 'Sincronización completada',
          description: `${totalRecibidos} registros recibidos.`,
          color: 'success'
        })
      }
      return true
    } catch (err) {
      if (!silent) {
        toast.add({
          title: 'Error en sincronización',
          description: err.data?.statusMessage || err.statusMessage || err.message || 'Error desconocido.',
          color: 'error'
        })
      }
      return false
    } finally {
      sincronizando.value = false
      await actualizarPendientesCount()
    }
  }

  async function reunirPendientes() {
    const result = {}
    for (const t of TABLAS_SYNC) {
      const repo = useLocalRepo(t)
      const todos = await repo.readAll()
      result[t] = todos
        .filter(r => !r.sincronizado)
        .map(({ sincronizado, ...rest }) => rest)
    }
    return result
  }

  async function marcarAceptados(aceptados, pendientes) {
    if (!aceptados?.length) return
    const idsSet = new Set(aceptados)
    for (const t of TABLAS_SYNC) {
      const rows = pendientes[t]
      if (!rows?.length) continue
      const repo = repoDe(t)
      for (const reg of rows) {
        if (idsSet.has(reg.id)) {
          try {
            await repo.update(reg.id, { sincronizado: 1 })
          } catch {}
        }
      }
    }
  }

  async function absorberConflictos(conflictos) {
    if (!conflictos) return
    for (const [tabla, registros] of Object.entries(conflictos)) {
      if (!registros?.length) continue
      const repo = repoDe(tabla)
      for (const reg of registros) {
        try {
          await repo.update(reg.id, { ...reg, sincronizado: 1 })
        } catch {}
      }
    }
  }

  async function aplicarPull(pullResult) {
    for (const t of TABLAS_SYNC) {
      const registros = pullResult[t]
      if (!registros?.length) continue
      const repo = repoDe(t)
      for (const reg of registros) {
        const existing = await repo.read(reg.id)
        if (existing) {
          await repo.update(reg.id, { ...reg, sincronizado: 1 })
        } else {
          await repo.create({ ...reg, sincronizado: 1 })
        }
      }
    }
  }

  async function actualizarPendientesCount() {
    const pendientes = await reunirPendientes()
    pendientesCount.value = TABLAS_SYNC.reduce((s, t) => s + (pendientes[t]?.length ?? 0), 0)
  }

  async function descargarCatalogo() {
    try {
      const data = await remoteApi.getProductosActivos()
      await guardarProductosCache(data)
      toast.add({ title: 'Catálogo actualizado', description: `${data.length} productos descargados.`, color: 'success' })
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    }
  }

  async function guardarProductosCache(productos) {
    const repo = useLocalRepo('productos')
    const existentes = await repo.readAll()

    for (const prod of productos) {
      const existing = existentes.find(e => e.id === prod.id)
      if (existing) {
        await repo.update(prod.id, { ...prod, sincronizado: 1 })
      } else {
        await repo.create({ ...prod, sincronizado: 1 })
      }
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
    descargarCatalogo,
    remoteApi,
    aplicarPull
  }
}
