/**
 * useRemoteApi - Composable para llamadas a endpoints de sincronización y API remota autenticada.
 *
 * @returns {Object} Métodos para interactuar con la API remota de sincronización:
 * @returns {Function} returns.getProductosActivos - Obtiene productos activos del servidor.
 * @returns {Function} returns.syncPush - Envía cambios locales al servidor (POST /api/sync/push).
 * @returns {Function} returns.syncPull - Obtiene cambios del servidor desde timestamp (GET /api/sync/pull?desde=).
 *
 * @example
 * const { getProductosActivos, syncPush, syncPull } = useRemoteApi()
 *
 * // Descargar catálogo
 * const productos = await getProductosActivos()
 *
 * // Sincronizar cambios
 * const pushResult = await syncPush({ productos: [...], cuadres: [...] })
 *
 * // Pull desde última sync
 * const pullResult = await syncPull(Date.now() - 86400000)
 */
import { $api } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'

export function useRemoteApi() {
  const { getHeaders } = useHeaders()

  function fetch(path, options = {}) {
    return $api(path, {
      ...options,
      headers: { ...getHeaders(), ...options.headers }
    })
  }

  return {
    getProductosActivos: () => fetch(API_ROUTES.syncProductosActivos),
    syncPush: payload =>
      fetch(API_ROUTES.syncPush, { method: 'POST', body: payload }),
    syncPull: desde => fetch(API_ROUTES.syncPull + '?desde=' + desde)
  }
}
