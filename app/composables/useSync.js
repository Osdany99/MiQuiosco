import { Preferences } from '@capacitor/preferences'
import { Network } from '@capacitor/network'
import { $api } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import { push as pushOffline, pull as pullOffline } from '../server-offline/api/sync'
import { removePendingDeletesAccepted, enrichForSync } from '../server-offline/api/_factory'
import { useDb } from '../server-offline/db/client'
import { mergeFields } from '../utils/syncMerge.js'
import { registrarSyncLog, mensajeDeError } from '../utils/syncLog'
import { registrarFallosLocales, subirFallosPendientes } from '../utils/syncFallos'
import { subirEventosVozPendientes } from '../utils/vozEventos'
import { infoDispositivo } from '../utils/dispositivo'
import { SYNC_TABLES } from '../../shared/tables'
import { getAuthInstance } from './useAuth.js'

const TABLAS_SYNC = SYNC_TABLES.map(t => t.tabla)
let _autoConfigurado = false
let _toastSingleton = null

const PREF_ULTIMA_SYNC = 'ultima_sincronizacion_en'
const PREF_ULTIMA_SYNC_OK = 'ultima_sincronizacion_ok_en'
const PREF_ULTIMO_INTENTO = 'ultimo_intento_en'

// Filas por petición de push. El push era UN solo POST con todos los
// pendientes: con miles de filas superaba el timeout del cliente (15 s) y el
// límite de ejecución de la función de Vercel, y la sincronización moría
// siempre en el mismo punto ("signal is aborted without reason"). Cada lote es
// atómico e idempotente en el servidor, así que trocear no cambia el resultado.
const FILAS_POR_LOTE = 150
const DELETES_POR_LOTE = 200

// Los endpoints de sync no son una petición de UI: se les da margen de sobra.
// El tamaño del lote es lo que mantiene cada petición corta.
const TIMEOUT_PUSH_MS = 60_000
const TIMEOUT_PULL_MS = 60_000

// Estado COMPARTIDO a nivel módulo (una sola sync visible para toda la app):
// useSync() se instancia en varios componentes y cada uno tendría su propio
// `sincronizando`; el banner del layout necesita una fuente única.
const faseSync = ref('inactiva') // inactiva|preparando|subiendo|bajando|aplicando
const progresoSync = ref({ actual: 0, total: 0 })
const controlesSync = new Set()

// Cola de sincronizaciones. El login lanza un pull en segundo plano y el
// cambio a online puede disparar un push justo después: dos escrituras sobre
// la misma conexión sqlite a la vez compiten y el progreso salta.
let colaSync = Promise.resolve()

function enColaSync(tarea) {
  const turno = colaSync.then(tarea, tarea)
  colaSync = turno.then(() => {}, () => {})
  return turno
}

// Cancela la(s) sincronización(es) en curso. Seguro en cualquier punto: cada
// lote del push es transaccional e idempotente, el pull se aplica con upserts y
// el watermark solo avanza al completar, así que el próximo intento reenvía o
// reaplica lo que faltó. El modo no cambia hasta completar.
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

export function useSync() {
  const auth = (import.meta.client && getAuthInstance()) || useAuth()
  const toast = (() => {
    try {
      const t = useToast()
      _toastSingleton = t
      return t
    } catch {
      return _toastSingleton
    }
  })()

  const sincronizando = ref(false)
  const ultimaSync = ref(null)
  const pendientesCount = ref(0)
  const hayRed = ref(true)
  const ultimaSyncOk = ref(null)
  const ultimoIntento = ref(null)

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

    try {
      const s1 = await Preferences.get({ key: PREF_ULTIMA_SYNC_OK })
      if (s1.value) ultimaSyncOk.value = Number(s1.value)
      const s2 = await Preferences.get({ key: PREF_ULTIMO_INTENTO })
      if (s2.value) ultimoIntento.value = Number(s2.value)
    } catch {}

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
        if (s.connected) {
          sincronizarAuto({ motivo: 'red', silencioso: true }).catch(() => {})
        }
      })
      _networkListenerHandle = handle
    } catch {
      // Network no disponible (navegador / SSR)
    }

    // Validación forzada tras importar una BD reparada (ver backupBd.js).
    try {
      const r = await Preferences.get({ key: 'sync_revalidar_tras_importacion' })
      if (r.value === '1') {
        await Preferences.remove({ key: 'sync_revalidar_tras_importacion' })
        setTimeout(() => {
          validarSincronizacion(true).catch(() => {})
        }, 0)
      }
    } catch {}

    if (!_autoConfigurado) {
      _autoConfigurado = true
      ;(async () => {
        try {
          const { App } = await import('@capacitor/app')
          await App.addListener('appStateChange', (estado) => {
            if (estado?.isActive) {
              sincronizarAuto({ motivo: 'primer_plano', silencioso: true }).catch(() => {})
            }
          })
        } catch { /* no nativo / SSR */ }
      })()
      setInterval(() => {
        if (hayRed.value && pendientesCount.value > 0) {
          sincronizarAuto({ motivo: 'timer', silencioso: true }).catch(() => {})
        }
      }, 25 * 60 * 1000)
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
    faseSync.value = fase, progresoSync.value = { actual, total }
  }

  function fueCancelada(signal) {
    return !!signal?.aborted
  }

  /** Filas totales de un payload de sync (tablas + deletes). */
  function contarPayload(payload) {
    if (!payload) return 0
    return TABLAS_SYNC.reduce((s, t) => s + (payload[t]?.length ?? 0), 0)
      + (payload.deletes?.length ?? 0)
  }

  /**
   * Trocea el push en lotes respetando el orden topológico de SYNC_TABLES:
   * los padres siempre viajan antes que sus hijos, así las FK se cumplen lote a
   * lote igual que se cumplían en la única transacción de antes.
   */
  function construirLotes(pendientes) {
    const lotes = []
    for (const tabla of TABLAS_SYNC) {
      const filas = pendientes?.[tabla]
      if (!filas?.length) continue
      for (let i = 0; i < filas.length; i += FILAS_POR_LOTE) {
        lotes.push({ tabla, filas: filas.slice(i, i + FILAS_POR_LOTE) })
      }
    }
    const deletes = pendientes?.deletes ?? []
    for (let i = 0; i < deletes.length; i += DELETES_POR_LOTE) {
      lotes.push({ deletes: deletes.slice(i, i + DELETES_POR_LOTE) })
    }
    return lotes
  }

  async function _subirPendientes(pendientes, signal) {
    const lotes = construirLotes(pendientes)
    const total = contarPayload(pendientes)
    let enviados = 0
    informarFase('subiendo', 0, total)

    for (const lote of lotes) {
      if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')

      const tablaLote = lote.deletes ? 'deletes' : lote.tabla
      const filasLote = lote.deletes ? lote.deletes.length : lote.filas.length
      const inicioLote = Date.now()

      try {
        if (lote.deletes) {
          const res = await fetch(API_ROUTES.syncPush, {
            method: 'POST',
            body: { deletes: lote.deletes },
            signal,
            timeoutMs: TIMEOUT_PUSH_MS
          })
          if (res.deletesAceptados?.length) {
            await removePendingDeletesAccepted(res.deletesAceptados)
          }
          enviados += lote.deletes.length
        } else {
          const res = await fetch(API_ROUTES.syncPush, {
            method: 'POST',
            body: { [lote.tabla]: lote.filas },
            signal,
            timeoutMs: TIMEOUT_PUSH_MS
          })
          // Cierre inmediato del lote: si el siguiente falla, lo ya aceptado no
          // se vuelve a subir. `marcarSincronizados` hace un UPDATE por lote, no
          // uno por fila.
          await marcarAceptados(lote.tabla, res.aceptados)
          await marcarBasesAceptadas(lote.tabla, lote.filas, res.aceptados)
          await absorberConflictos(res.conflictos, signal)

          // Rechazos por fila: se quedan pendientes en el dispositivo y se
          // guardan en el buzón para que el panel sepa qué fila y por qué.
          if (res.rechazos?.length) {
            await registrarFallosLocales(res.rechazos.map(rechazo => ({
              tipo: 'push_rechazo',
              fase: 'push',
              tabla: rechazo.tabla ?? lote.tabla,
              registroId: rechazo.id,
              codigoHttp: rechazo.codigo,
              motivo: rechazo.motivo,
              mensaje: rechazo.detalle,
              fila: lote.filas.find(f => f.id === rechazo.id),
              contexto: { transitorio: !!rechazo.transitorio }
            })))
          }

          enviados += lote.filas.length
        }
      } catch (err) {
        // El lote que falla es el dato más útil del log: sin esto solo se sabe
        // "falló la sync", no dónde. La cancelación del usuario no es un error.
        if (!fueCancelada(signal)) {
          await registrarSyncLog({
            nivel: 'error',
            evento: 'push_lote_error',
            tabla: tablaLote,
            filas: filasLote,
            duracionMs: Date.now() - inicioLote,
            http: err?.status ?? err?.statusCode ?? null,
            mensaje: mensajeDeError(err),
            datos: { timeout: !!err?.timeout }
          })
        }
        throw err
      }

      await registrarSyncLog({
        evento: 'push_lote',
        tabla: tablaLote,
        filas: filasLote,
        duracionMs: Date.now() - inicioLote,
        http: 200
      })

      informarFase('subiendo', enviados, total)
    }

    return { enviados, total }
  }

  async function _ejecutarPull(signal) {
    const desde = ultimaSync.value ?? 0
    informarFase('bajando')
    const inicioPull = Date.now()
    const pullResult = await fetch(API_ROUTES.syncPull + '?desde=' + desde, {
      signal,
      timeoutMs: TIMEOUT_PULL_MS
    })
    if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')

    const total = contarPayload(pullResult)
    await registrarSyncLog({
      evento: 'pull',
      filas: total,
      duracionMs: Date.now() - inicioPull,
      http: 200,
      datos: { desde }
    })

    informarFase('aplicando', 0, total)
    await pullOffline(pullResult, {
      signal,
      onProgress: procesados => informarFase('aplicando', Math.min(procesados, total), total)
    }, null)
    try {
      const { usePermisos } = await import('./usePermisos.js')
      if (pullResult?.puesto) await usePermisos().guardarDesdePuesto(pullResult.puesto)
    } catch {}
    informarFase('aplicando', total, total)

    const ahora = pullResult.timestamp_servidor ?? Date.now()
    ultimaSync.value = ahora
    await Preferences.set({ key: PREF_ULTIMA_SYNC, value: String(ahora) })

    return pullResult
  }

  async function sincronizarAhora(silencioso = false) {
    if (!auth.sesionLocalVigente()) {
      if (!silencioso) toast?.add?.({
        title: 'Sesión expirada',
        description: 'Vuelve a iniciar sesión para sincronizar.',
        color: 'warning'
      })
      await auth.invalidarSesionLocal()
      await navigateTo('/login')
      return false
    }

    if (!hayRed.value) {
      if (!silencioso) toast?.add?.({
        title: 'Sin conexión',
        description: 'No hay red disponible para sincronizar.',
        color: 'error'
      })
      return false
    }

    if (!auth.jwtSync.value) {
      if (!silencioso) toast?.add?.({
        title: 'Reautenticación',
        description: 'Necesitas volver a iniciar sesión para sincronizar.',
        color: 'warning'
      })
      await auth.logout()
      await navigateTo('/login')
      return false
    }

    sincronizando.value = true
    return enColaSync(() => conSenalSync(async (signal) => {
      const inicioMs = Date.now()
      let exito = false
      try {
        informarFase('preparando')
        await registrarSyncLog({
          evento: 'sync_inicio',
          datos: { desde: ultimaSync.value, pendientes: pendientesCount.value }
        })

        // `pushOffline` lee las filas crudas y con `sincronizado = 0`. Se pasa
        // el auth para filtrar por puesto antes de partir los lotes.
        const pendientes = await pushOffline({}, auth)
        if (fueCancelada(signal)) throw new Error('Sincronización cancelada.')

        const subida = await _subirPendientes(pendientes, signal)
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

        exito = true
        ultimaSyncOk.value = Date.now()
        await Preferences.set({ key: PREF_ULTIMA_SYNC_OK, value: String(ultimaSyncOk.value) }).catch(() => {})
        await registrarSyncLog({
          evento: 'sync_fin',
          duracionMs: Date.now() - inicioMs,
          filas: subida.enviados,
          datos: { enviados: subida.enviados, total: subida.total }
        })
        return true
      } catch (err) {
        if (fueCancelada(signal) || err?.cancelacionUsuario) {
          await registrarSyncLog({
            nivel: 'warn',
            evento: 'sync_cancelada',
            duracionMs: Date.now() - inicioMs
          })
          toast?.add?.({
            title: 'Sincronización cancelada',
            description: 'Puedes reintentarlo cuando quieras: no se perdió ningún cambio.',
            color: 'info'
          })
          return false
        }
        await registrarSyncLog({
          nivel: 'error',
          evento: 'sync_error',
          duracionMs: Date.now() - inicioMs,
          http: err?.status ?? err?.statusCode ?? null,
          mensaje: mensajeDeError(err),
          datos: {
            timeout: !!err?.timeout,
            fase: faseSync.value
          }
        })
        // Además de la traza local, el fallo va al buzón que sube al servidor.
        await registrarFallosLocales([{
          tipo: 'sync_error',
          fase: 'sync',
          codigoHttp: err?.status ?? err?.statusCode ?? null,
          motivo: err?.timeout ? 'red' : (err?.status || err?.statusCode ? 'http' : 'red'),
          mensaje: mensajeDeError(err),
          contexto: { timeout: !!err?.timeout, fase: faseSync.value }
        }])
        if (!silencioso) toast?.add?.({
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
        await actualizarPendientesCount().catch(() => {})
        // Sube el buzón de fallos (lotes de 100). Best-effort: si no hay red se
        // queda pendiente para la próxima sync.
        await subirFallosPendientes(fetch).catch(() => {})
        await subirEventosVozPendientes(fetch).catch(() => {})
        await reportarEstadoSync(exito).catch(() => {})
      }
    }))
  }

  async function pullServidor({ silent = false } = {}) {
    if (!auth.sesionLocalVigente()) {
      if (!silent) {
        toast?.add?.({
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
    return enColaSync(() => conSenalSync(async (signal) => {
      try {
        await _ejecutarPull(signal)
        return true
      } catch (err) {
        if (fueCancelada(signal) || err?.cancelacionUsuario) {
          if (!silent) {
            toast?.add?.({
              title: 'Sincronización cancelada',
              description: 'Puedes reintentarlo cuando quieras: no se perdió ningún cambio.',
              color: 'info'
            })
          }
          return false
        }
        // El primer pull (aprovisionamiento) es el que más interesa diagnosticar
        // si falla: de él depende que el aparato quede usable.
        await registrarSyncLog({
          nivel: 'error',
          evento: 'pull_error',
          http: err?.status ?? err?.statusCode ?? null,
          mensaje: mensajeDeError(err),
          datos: { desde: ultimaSync.value, timeout: !!err?.timeout }
        })
        await registrarFallosLocales([{
          tipo: 'pull_error',
          fase: 'pull',
          codigoHttp: err?.status ?? err?.statusCode ?? null,
          motivo: 'red',
          mensaje: mensajeDeError(err),
          contexto: { desde: ultimaSync.value, timeout: !!err?.timeout }
        }])
        if (!silent) {
          toast?.add?.({
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
        await actualizarPendientesCount().catch(() => {})
      }
    }))
  }

  /**
   * Marca como sincronizadas las filas que el servidor aceptó en un lote.
   *
   * Escritura directa, no por el repo: esto NO es una edición del usuario sino
   * el cierre de una subida que el servidor ya aceptó. Por eso no se toca
   * `actualizadoEn` (el bueno es el que ya trae la fila) y solo se pone
   * `sincronizado = 1`.
   */
  async function marcarAceptados(tabla, ids) {
    if (!ids?.length) return
    try {
      await useDb().marcarSincronizados(tabla, ids)
    } catch {
      // best-effort: se reintentará en la siguiente sync
    }
  }

  async function marcarBasesAceptadas(tabla, filas, aceptados) {
    const set = new Set(aceptados ?? [])
    if (!set.size) return
    const { Preferences } = await import('@capacitor/preferences')
    for (const fila of filas ?? []) {
      if (!set.has(fila.id)) continue
      try {
        const ts = fila.actualizadoEn ? new Date(fila.actualizadoEn).getTime() : 0
        if (ts) await Preferences.set({ key: `sync_base:${tabla}:${fila.id}`, value: String(ts) })
      } catch {}
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
          let base = null
          try {
            const { Preferences } = await import('@capacitor/preferences')
            const raw = await Preferences.get({ key: `sync_base_val:${tabla}:${server?.id}` })
            base = raw?.value ? JSON.parse(raw.value) : null
          } catch {}
          try {
            // Hacer visible el conflicto en el buzón central (/admin/fallos):
            // se reporta como push_rechazo/conflicto para que el jefe lo revise.
            await registrarFallosLocales([{
              tipo: 'push_rechazo',
              fase: 'push',
              tabla: String(tabla),
              registroId: server?.id ?? client?.id,
              codigoHttp: 409,
              motivo: 'conflicto',
              mensaje: 'Conflicto resuelto por merge: el servidor tenia una version posterior.',
              contexto: {}
            }])
          } catch {}
          const { merged, difiereDelServidor } = mergeFields(server, client, base)
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
          try {
            const { Preferences } = await import('@capacitor/preferences')
            const _tsSrc = conflicto?.server?.actualizadoEn ?? conflicto?.actualizadoEn
            const ts = _tsSrc ? new Date(_tsSrc).getTime() : 0
            if (ts) await Preferences.set({ key: `sync_base:${tabla}:${merged.id}`, value: String(ts) })
          } catch {}
        } catch {
          // absorber conflicto best-effort
        }
      }
    }
  }

  /**
   * Conteo de pendientes con un COUNT por tabla (`contarPendientes`), sin
   * volver a leer las 21 tablas completas cada vez que termina una sync.
   */
  async function actualizarPendientesCount(pendientesYaCalculados = null) {
    if (pendientesYaCalculados) {
      pendientesCount.value = contarPayload(pendientesYaCalculados)
      return
    }
    const db = useDb()
    let total = 0
    for (const tabla of TABLAS_SYNC) {
      try {
        total += await db.contarPendientes(tabla)
      } catch {
        // tabla aún sin migrar en esta instalación
      }
    }
    pendientesCount.value = total
  }

  /**
   * Latido al servidor (`POST /api/sync/estado`): pendientes locales y si la
   * última sync completa terminó bien. Alimenta el panel de dispositivos.
   *
   * Es telemetría: el llamador la envuelve en `.catch()` y nunca bloquea la UI.
   */
  async function reportarEstadoSync(syncOk) {
    if (!auth.jwtSync.value || !hayRed.value) return
    const info = infoDispositivo()
    await fetch(API_ROUTES.syncEstado, {
      method: 'POST',
      body: {
        pendientes: pendientesCount.value,
        syncOk: syncOk === true,
        modelo: info.modelo,
        android: info.android
      },
      timeoutMs: 15000
    })
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
      toast?.add?.({
        title: 'Error',
        description: err.data?.statusMessage || err.message,
        color: 'error'
      })
    }
  }

  async function validarSincronizacion(silencioso = false) {
    try {
      ultimaSync.value = 0
      ultimaSyncOk.value = null
      ultimoIntento.value = null
      await Preferences.set({ key: PREF_ULTIMA_SYNC, value: '0' })
      await Preferences.remove({ key: PREF_ULTIMA_SYNC_OK }).catch(() => {})
      await Preferences.remove({ key: PREF_ULTIMO_INTENTO }).catch(() => {})
      for (const tabla of TABLAS_SYNC) {
        try {
          await useDb().marcarTodosNoSincronizados(tabla)
        } catch { /* tabla aún no migrada */ }
      }
      await actualizarPendientesCount()
    } catch { /* tolerante */ }
    return await sincronizarAhora(silencioso)
  }

  function puedeSincronizarEnSegundoPlano() {
    return !!auth.jwtSync.value
  }

  function esDebida() {
    const ahora = Date.now()
    if (ultimoIntento.value && ahora - ultimoIntento.value < 5 * 60 * 1000) return false
    if (!ultimaSyncOk.value) return true
    const ms = ahora - ultimaSyncOk.value
    if (ms > 12 * 60 * 60 * 1000) return true
    if (pendientesCount.value > 0 && ms > 30 * 60 * 1000) return true
    return false
  }

  async function sincronizarAuto({ motivo = 'auto', silencioso = true } = {}) {
    void motivo
    if (!puedeSincronizarEnSegundoPlano()) return false
    if (!hayRed.value) return false
    if (haySyncEnCurso()) return false
    if (!esDebida()) return false
    ultimoIntento.value = Date.now()
    try {
      await Preferences.set({ key: PREF_ULTIMO_INTENTO, value: String(ultimoIntento.value) })
    } catch {}
    const ok = await sincronizarAhora(silencioso)
    if (ok) {
      ultimaSyncOk.value = Date.now()
      try {
        await Preferences.set({ key: PREF_ULTIMA_SYNC_OK, value: String(ultimaSyncOk.value) })
      } catch {}
    }
    return ok
  }

  return {
    sincronizando: readonly(sincronizando),
    faseSync: readonly(faseSync),
    progresoSync: readonly(progresoSync),
    ultimaSync: readonly(ultimaSync),
    ultimaSyncOk: readonly(ultimaSyncOk),
    ultimoIntento: readonly(ultimoIntento),
    pendientesCount: readonly(pendientesCount),
    hayRed: readonly(hayRed),
    cargarEstado,
    sincronizarAhora,
    sincronizarAuto,
    validarSincronizacion,
    pullServidor,
    conSenalSync,
    informarFase,
    fetchPull: (desde, signal) => fetch(API_ROUTES.syncPull + '?desde=' + desde, {
      signal,
      timeoutMs: TIMEOUT_PULL_MS
    }),
    contarPayload,
    descargarCatalogo,
    aplicarPull: pullOffline
  }
}

// mergeFields re-export removed to avoid Nuxt auto-import duplicate warning;
// import directly from '~/utils/syncMerge' where needed.
