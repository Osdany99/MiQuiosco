import type { Producto, Cuadre, CuadreItem } from '~~/shared/types'

/**
 * Wrapper de $fetch tipado contra la API remota (servidor Nitro).
 * Incluye automáticamente los headers de Authorization según el contexto.
 */

export function useRemoteApi() {
  const auth = useAuth()

  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (auth.jwtAdmin.value) {
      headers.Authorization = `Bearer ${auth.jwtAdmin.value}`
    } else if (auth.jwtSync.value) {
      headers.Authorization = `Bearer ${auth.jwtSync.value}`
    }
    return headers
  }

  async function fetch<T>(
    path: string,
    options: Parameters<typeof $fetch<T>>[1] = {}
  ): Promise<T> {
    return $fetch<T>(path, {
      ...options,
      headers: {
        ...getHeaders(),
        ...options.headers
      }
    })
  }

  // ===== Productos =====
  async function getProductosActivos(): Promise<{ id: string, nombre: string, precio_venta_actual: number, orden: number }[]> {
    return fetch('/api/sync/productos-activos')
  }

  // ===== Sincronización =====
  async function syncPush(payload: {
    productos: Producto[]
    historial_precios: any[]
    cuadres: Cuadre[]
    cuadre_items: CuadreItem[]
  }) {
    return fetch<{ aceptados: string[], conflictos: any }>('/api/sync/push', {
      method: 'POST',
      body: payload
    })
  }

  async function syncPull(desde: number) {
    return fetch<any>(`/api/sync/pull?desde=${desde}`)
  }

  // ===== Autenticación =====
  async function cambiarPinInicial(data: {
    usuario_id: string
    pin_actual: string
    pin_nuevo: string
    pin_nuevo_confirmacion: string
  }) {
    return fetch('/api/auth/cambiar-pin-inicial', {
      method: 'POST',
      body: data
    })
  }

  return {
    getProductosActivos,
    syncPush,
    syncPull,
    cambiarPinInicial
  }
}
