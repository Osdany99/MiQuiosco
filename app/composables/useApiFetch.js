/**
 * useApiFetch - Wrapper sobre useFetch que inyecta headers de autenticación automáticamente.
 *
 * @param {string} url - Endpoint de la API a consumir.
 * @param {Object} [options={}] - Opciones adicionales para useFetch (se mezclan con headers de auth).
 * @param {boolean} [options.server=false] - Si hacer fetch en servidor (SSR). Por defecto false (client-only).
 * @param {Object} [options.headers] - Headers adicionales que se combinan con los de autenticación.
 * @param {any} [options.query] - Query params para la URL.
 * @param {string} [options.method='GET'] - Método HTTP.
 * @param {any} [options.body] - Body para POST/PUT/PATCH.
 *
 * @returns {Promise<Object>} Retorno de useFetch con:
 * @returns {Ref} returns.data - Datos de la respuesta (reactivo).
 * @returns {Ref<Error|null>} returns.error - Error si la petición falló.
 * @returns {Ref<string>} returns.status - Estado: 'idle' | 'pending' | 'success' | 'error'.
 * @returns {Function} returns.refresh - Función para re-ejecutar el fetch.
 * @returns {Ref<boolean>} returns.pending - True mientras la petición está en curso.
 *
 * @example
 * const { data, pending, error, refresh } = useApiFetch('/api/productos', {
 *   query: { activo: true },
 *   method: 'GET'
 * })
 */
export function useApiFetch(url, options = {}) {
  const { getHeaders } = useHeaders()

  return useFetch(url, {
    ...options,
    server: false,
    headers: { ...getHeaders(), ...options.headers }
  })
}
