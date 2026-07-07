/**
 * useHeaders - Headers de autorización para API remota (sync).
 *
 * Solo usa jwtSync (token de sincronización del jefe).
 */
export function useHeaders() {
  const auth = useAuth()

  function getHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return { getHeaders }
}
