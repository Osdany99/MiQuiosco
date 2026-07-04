import { ref, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { Network } from '@capacitor/network'
import { useAuth } from './useAuth'
import { useLocalDb } from './useLocalDb'
import { useRemoteApi } from './useRemoteApi'
import { useToast } from '#imports'

const PREF_ULTIMA_SYNC = 'ultima_sincronizacion_en'

/**
 * useSync - Composable para sincronización bidireccional (push/pull) con el servidor.
 * Gestiona estado de red, colas de pendientes, conflictos y descarga de catálogo.
 *
 * @returns {Object} Estado y métodos de sincronización:
 * @returns {ComputedRef<boolean>} returns.sincronizando - True durante sincronización activa.
 * @returns {ComputedRef<number|null>} returns.ultimaSync - Timestamp de última sync exitosa (ms).
 * @returns {ComputedRef<number>} returns.pendientesCount - Cantidad de registros locales sin sincronizar.
 * @returns {ComputedRef<boolean>} returns.hayRed - True si hay conexión de red detectada.
 * @returns {Function} returns.cargarEstado - Inicializa listeners y carga última sync + pendientes.
 * @returns {Function} returns.sincronizarAhora - Ejecuta ciclo completo push+pull (requiere sesión + red + JWT sync).
 * @returns {Function} returns.descargarCatalogo - Descarga productos activos y guarda en cache local (trabajador).
 *
 * @example
 * const { sincronizando, ultimaSync, pendientesCount, hayRed, cargarEstado, sincronizarAhora, descargarCatalogo } = useSync()
 *
 * // En onMounted
 * await cargarEstado()
 *
 * // Botón sincronizar
 * const handleSync = async () => {
 *   const ok = await sincronizarAhora()
 *   if (ok) console.log('Sync completada')
 * }
 *
 * // Trabajador: descargar catálogo
 * await descargarCatalogo()
 */
export function useSync() {
  const auth = useAuth()
  const localDb = useLocalDb()
  const remoteApi = useRemoteApi()
  const toast = useToast()

  const sincronizando = ref(false)
  const ultimaSync = ref(null)
  const pendientesCount = ref(0)
  const hayRed = ref(true)

  async function cargarEstado() {
    const stored = await Preferences.get({ key: PREF_ULTIMA_SYNC })
    if (stored.value) ultimaSync.value = Number(stored.value)

    // Contar registros locales sin sincronizar
    try {
      await localDb.getConnection()
      // Por simplicidad, usamos una query genérica
      // En implementación real se harían queries por tabla
      pendientesCount.value = 0 // placeholder
    } catch {
      console.log('prueba')
    }

    const status = await Network.getStatus()
    hayRed.value = status.connected

    Network.addListener('networkStatusChange', (s) => {
      hayRed.value = s.connected
    })
  }

  /**
   * Ciclo completo de sincronización: push + pull.
   * Exige sesión local vigente + JWT de sync válido.
   * @returns {Promise<boolean>} True si la sincronización fue exitosa.
   */
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
      // No hay JWT de sync, pedir PIN y re-login
      toast.add({ title: 'Reautenticación', description: 'Necesitas volver a iniciar sesión para sincronizar.', color: 'warning' })
      await auth.logout()
      await navigateTo('/login')
      return false
    }

    sincronizando.value = true
    try {
      // 1. Reunir cambios locales pendientes
      const pendientes = await reunirPendientes()

      // 2. Push
      const pushResult = await remoteApi.syncPush(pendientes)

      // 3. Marcar aceptados como sincronizados
      await marcarSincronizados(pushResult.aceptados)

      // 4. Absorber conflictos (sobrescribir local con servidor)
      await absorberConflictos(pushResult.conflictos)

      // 5. Pull
      const desde = ultimaSync.value ?? 0
      const pullResult = await remoteApi.syncPull(desde)
      await aplicarPull(pullResult)

      // 6. Actualizar timestamp de última sync exitosa
      const ahora = Date.now()
      ultimaSync.value = ahora
      await Preferences.set({ key: PREF_ULTIMA_SYNC, value: String(ahora) })

      toast.add({
        title: 'Sincronización completada',
        description: `Subidos: ${pushResult.aceptados.length}, Recibidos: ${pullResult.productos.length + pullResult.cuadres.length + pullResult.cuadre_items.length}`,
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
      // Actualizar contador de pendientes
      await actualizarPendientesCount()
    }
  }

  async function reunirPendientes() {
    await localDb.getConnection()
    // En implementación real: query por cada tabla WHERE sincronizado = false
    // Aquí devolvemos arrays vacíos como placeholder
    return {
      productos: [],
      historial_precios: [],
      cuadres: [],
      cuadre_items: []
    }
  }

  async function marcarSincronizados() {
    // Actualizar sincronizado = true para los IDs dados
    // Placeholder
  }

  async function absorberConflictos() {
    // Sobrescribir local con versión del servidor
    // Placeholder
  }

  async function aplicarPull() {
    // Aplicar productos, historial, cuadres, items, usuarios
    // Placeholder
  }

  async function actualizarPendientesCount() {
    pendientesCount.value = 0 // placeholder
  }

  // ===== Helpers para descarga de catálogo (trabajador) =====
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
    await localDb.getConnection()
    // Limpiar e insertar
    // Placeholder
  }

  return {
    sincronizando: readonly(sincronizando),
    ultimaSync: readonly(ultimaSync),
    pendientesCount: readonly(pendientesCount),
    hayRed: readonly(hayRed),
    cargarEstado,
    sincronizarAhora,
    descargarCatalogo
  }
}
