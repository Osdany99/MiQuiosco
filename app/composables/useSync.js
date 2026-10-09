import { Preferences } from '@capacitor/preferences'
import { Network } from '@capacitor/network'
import { $api } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import { push as pushOffline, pull as pullOffline } from '../server-offline/api/sync'
import { removePendingDeletesAccepted, enrichForSync } from '../server-offline/api/_factory'
import { useDb } from '../server-offline/db/client'
import { mergeFields } from '../utils/syncMerge.js'
import { etiquetaFaseSync } from '../utils/syncFases.js'
import { SYNC_TABLES } from '../../shared/tables'

const TABLAS_SYNC = SYNC_TABLES.map(t => t.tabla)

const PREF_ULTIMA_SYNC = 'ultima_sincronizacion_en'

// Estado COMPARTIDO a nivel módulo (una sola sync visible para toda la app):
// useSync() se instancia en varios componentes y cada uno tendría su propio
// `sincronizando`; el banner del layout necesita una fuente única.
const faseSync = ref('inactiva') // inactiva|preparando|subiendo|bajando|aplicando
const progresoSync = ref({ actual: 0, total: 0 })
const controlesSync = new Set()

// Cancela la(s) sincronización(es) en curso. Seguro en cualquier punto: el
// push del servidor es transaccional e idempotente, el pull se aplica con
// upserts y el watermark solo avanza al completar, así que el próximo intento
// reenvía/reaplica lo que faltó. El modo no cambia hasta completar.
export function cancelarSincronizacion() {
  for (const c of controlesSync) {
    try {
      c.abort()
    } catch { /* noop */ }
  }
}

export function haySyncEnCurso() {
  return controlesSync.size > 0
}

// Etiqueta para el banner/menú (re-export del helper puro testeable).
export { etiquetaFaseSync }

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

  // Ejecuta fn con una señal de cancelación registrada globalmente (el botón
  // Cancelar del banner la aborta). Al terminar se desregistra; si no queda
  // ninguna activa, la fase vuelve a inactiva.
  async function conSenalSync(fn) {
    const ctrl = new AbortController()
    controlesSync.add(ctrl)
    try {
      return await fn(ctrl.signal)
    } finally {
      controlesSync.delete(ctrl)
      if (controlesSync.size === 0) {
        faseSync.value = 'inactiva'
        progresoSync.value = { actual: 0, total: 0 }
      }
    }
  }

  function informarFase(fase, actual = 0, total = 0) {
    faseSync.value = fase
    progresoSync.value = { actual, total }
  }

  function fueCancelada(signal) {
    return !!signal?.aborted
  }

  async function _ejecutarPull(signal) {
    const desde = ultimaSync.value ?? 0
    informarFase('bajando')
    const pullResult = await fetch(API_ROUTES.syncPull + '?desde=' + desde, { signal })
    if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')
    const total = TABLAS_SYNC.reduce((s, t) => s + (pullResult[t]?.length ?? 0), 0)
      + (pullResult.deletes?.length ?? 0)
    informarFase('aplicando', 0, total)
    const aplicado = await pullOffline(pullResult, { signal }, null)
    informarFase('aplicando', total, total)
    void aplicado

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
    return await conSenalSync(async (signal) => {
      try {
        informarFase('preparando')
        const pendientes = await pushOffline({}, null)
        const totalPendientes = TABLAS_SYNC.reduce(
          (s, t) => s + (pendientes[t]?.length ?? 0),
          0
        )
        if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')

        informarFase('subiendo', 0, totalPendientes)
        const pushResult = await fetch(API_ROUTES.syncPush, { method: 'POST', body: pendientes, signal })

        informarFase('aplicando', 0, totalPendientes)
        await marcarAceptados(pushResult.aceptados, pendientes, signal)
        await absorberConflictos(pushResult.conflictos, signal)
        if (pushResult.deletesAceptados?.length) {
          await removePendingDeletesAccepted(pushResult.deletesAceptados)
        }
        if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')

        for (let intento = 0; intento < 2; intento++) {
          try {
            await _ejecutarPull(signal)
            break
          } catch (pullErr) {
            if (fueCancelada(signal)) throw pullErr
            if (intento === 1) throw pullErr
          }
        }

        return true
      } catch (err) {
        if (fueCancelada(signal) || err?.cancelacionUsuario) {
          toast.add({
            title: 'Sincronización cancelada',
            description: 'Puedes reintentarlo cuando quieras: no se perdió ningún cambio.',
            color: 'info'
          })
          return false
        }
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
    })
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
    return await conSenalSync(async (signal) => {
      try {
        await _ejecutarPull(signal)
        return true
      } catch (err) {
        if (fueCancelada(signal) || err?.cancelacionUsuario) {
          if (!silent) {
            toast.add({
              title: 'Sincronización cancelada',
              description: 'Puedes reintentarlo cuando quieras: no se perdió ningún cambio.',
              color: 'info'
            })
          }
          return false
        }
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
    })
  }

  async function marcarAceptados(aceptados, pendientes, signal) {
    if (!aceptados?.length) return
    const idsSet = new Set(aceptados)
    let vistos = 0
    for (const t of TABLAS_SYNC) {
      const rows = pendientes[t]
      if (!rows?.length) continue
      for (const reg of rows) {
        if (++vistos % 25 === 0) signal?.throwIfAborted?.()
        if (idsSet.has(reg.id)) {
          try {
            // Escritura directa, no por el repo: esto NO es una edición del
            // usuario sino el cierre de una subida que el servidor ya aceptó.
            // Por eso va con enrichForSync (marca la fila sincronizada) y no
            // con enrichForUpdate, que la dejaría pendiente otra vez. Además
            // evita disparar la mutación de productos por marcar un id.
            await useDb().update(t, reg.id, enrichForSync(t, { sincronizado: 1 }))
          } catch {
            // best-effort: se reintentará en la siguiente sync
          }
        }
      }
    }
  }

  async function absorberConflictos(conflictos, signal) {
    if (!conflictos) return
    let vistos = 0
    for (const [tabla, conflictosTabla] of Object.entries(conflictos)) {
      if (!conflictosTabla?.length) continue
      for (const conflicto of conflictosTabla) {
        if (++vistos % 25 === 0) signal?.throwIfAborted?.()
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
          // enrichForSync y no enrichForUpdate: el patch mezcla datos del
          // servidor, así que su marca de tiempo es la buena. Con
          // enrichForUpdate la fila quedaría siempre pendiente de subir.
          await useDb().update(tabla, merged.id, enrichForSync(tabla, patch))
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
          // enrichForSync: el catálogo viene del servidor, la fila queda
          // marcada como sincronizada (una edición local aquí se quedaría
          // pendiente para siempre, reenviando el catálogo viejo).
          await useDb().update('productos', prod.id, enrichForSync('productos', { ...prod, sincronizado: 1 }))
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
    faseSync: readonly(faseSync),
    progresoSync: readonly(progresoSync),
    ultimaSync: readonly(ultimaSync),
    pendientesCount: readonly(pendientesCount),
    hayRed: readonly(hayRed),
    cargarEstado,
    sincronizarAhora,
    pullServidor,
    conSenalSync,
    informarFase,
    fetchPull: (desde, signal) => fetch(API_ROUTES.syncPull + '?desde=' + desde, { signal }),
    descargarCatalogo,
    aplicarPull: pullOffline
  }
}

// mergeFields re-export removed to avoid Nuxt auto-import duplicate warning;
// import directly from '~/utils/syncMerge' where needed.
