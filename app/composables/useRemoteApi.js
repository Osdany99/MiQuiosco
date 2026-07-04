export function useRemoteApi() {
  const { getHeaders } = useHeaders()

  function fetch(path, options = {}) {
    return $fetch(path, {
      ...options,
      headers: { ...getHeaders(), ...options.headers }
    })
  }

  return {
    getProductosActivos: () => fetch('/api/sync/productos-activos'),
    syncPush: payload => fetch('/api/sync/push', { method: 'POST', body: payload }),
    syncPull: desde => fetch(`/api/sync/pull?desde=${desde}`),
    cambiarPinInicial: data => fetch('/api/auth/cambiar-pin-inicial', { method: 'POST', body: data })
  }
}
