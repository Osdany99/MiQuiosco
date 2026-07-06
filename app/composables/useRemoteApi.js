/**
 * useRemoteApi - Composable para llamadas a endpoints de sincronización y API remota autenticada.
 *
 * @returns {Object} Métodos para interactuar con la API remota de sincronización:
 * @returns {Function} returns.getProductosActivos - Obtiene productos activos del servidor.
 * @returns {Function} returns.syncPush - Envía cambios locales al servidor (POST /api/sync/push).
 * @returns {Function} returns.syncPull - Obtiene cambios del servidor desde timestamp (GET /api/sync/pull?desde=).
 * @returns {Function} returns.cambiarPinInicial - Cambia PIN inicial del usuario (POST /api/auth/cambiar-pin-inicial).
 *
 * @example
 * const { getProductosActivos, syncPush, syncPull, cambiarPinInicial } = useRemoteApi()
 *
 * // Descargar catálogo
 * const productos = await getProductosActivos()
 *
 * // Sincronizar cambios
 * const pushResult = await syncPush({ productos: [...], cuadres: [...] })
 *
 * // Pull desde última sync
 * const pullResult = await syncPull(Date.now() - 86400000)
 *
 * // Cambiar PIN
 * await cambiarPinInicial({ pinActual: '1234', pinNuevo: '5678' })
 */
export function useRemoteApi() {
  const { getHeaders } = useHeaders()

  function fetch(path, options = {}) {
    return $fetch(path, {
      ...options,
      headers: { ...getHeaders(), ...options.headers }
    })
  }

  return {
    getProductosActivos: () => fetch(API.sync.productosActivos),
    syncPush: payload =>
      fetch(API.sync.push, { method: 'POST', body: payload }),
    syncPull: desde => fetch(API.sync.pull(desde)),
    cambiarPinInicial: data =>
      fetch(API.auth.cambiarPinInicial, { method: 'POST', body: data })
  }
}
