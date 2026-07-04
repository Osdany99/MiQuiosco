export function useHeaders() {
  const auth = useAuth()

  function getHeaders() {
    const token = auth.jwtAdmin.value || auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return { getHeaders }
}
