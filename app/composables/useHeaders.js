/**
 * useHeaders - Composable que provee headers de autorización (Bearer token) para peticiones HTTP.
 *
 * @returns {Object} Objeto con función para obtener headers:
 * @returns {Function} returns.getHeaders - Retorna objeto con Authorization header si hay token válido.
 * @returns {string} returns.getHeaders().Authorization - Header 'Bearer <token>' (jwtAdmin o jwtSync).
 *
 * @example
 * const { getHeaders } = useHeaders()
 * const headers = getHeaders()
 * // { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
 *
 * // Uso con $fetch
 * const data = await $fetch('/api/protegido', { headers: getHeaders() })
 */
export function useHeaders() {
  const auth = useAuth()

  function getHeaders() {
    const token = auth.jwtAdmin.value || auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return { getHeaders }
}
