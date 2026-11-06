import { useAdminAuth } from './useAdminAuth'

/**
 * useAdminApi — capa de datos del panel `/admin`.
 *
 * Centraliza el token, los parámetros vacíos y los errores para que las
 * páginas no repitan `$fetch` ni la navegación al login cuando el JWT caduca.
 * No guarda estado de listas: cada vista decide qué cargar y cuándo.
 */
export function useAdminApi() {
  const admin = useAdminAuth()

  /** Quita claves vacías para que `?estado=&tipo=` no llegue al servidor. */
  function queryLimpia(filtros) {
    const salida = {}
    for (const [clave, valor] of Object.entries(filtros ?? {})) {
      if (valor === undefined || valor === null || valor === '') continue
      salida[clave] = valor
    }
    return salida
  }

  async function pedir(path, { method = 'GET', query, body } = {}) {
    try {
      return await $fetch(path, {
        method,
        query: query ? queryLimpia(query) : undefined,
        body,
        headers: admin.cabeceras()
      })
    } catch (err) {
      const status = err?.statusCode ?? err?.status ?? err?.response?.status

      // Token caducado o usuario desactivado: no tiene sentido seguir en el
      // panel con datos a medias. El resto de errores (403, 409, 400) se
      // muestran en la vista para que el usuario pueda corregirlos.
      if (status === 401) {
        admin.limpiarSesion()
        await navigateTo({ path: '/admin/login', query: { reason: 'session_expired' } })
      }

      const error = new Error(mensajeErrorAdmin(err))
      error.statusCode = status
      error.data = err?.data
      throw error
    }
  }

  function resumen() {
    return pedir('/api/admin/resumen')
  }

  async function listarPuestos() {
    const respuesta = await pedir('/api/admin/puestos')
    return respuesta?.puestos ?? []
  }

  function crearPuesto(datos) {
    return pedir('/api/admin/puestos', { method: 'POST', body: datos })
  }

  function actualizarPuesto(id, cambios) {
    return pedir(`/api/admin/puestos/${id}`, { method: 'PATCH', body: cambios })
  }

  function actualizarJefe(id, cambios) {
    return pedir(`/api/admin/usuarios/${id}`, { method: 'PATCH', body: cambios })
  }

  function resetPin(id, pin) {
    return pedir(`/api/admin/usuarios/${id}/reset-pin`, { method: 'POST', body: { pin } })
  }

  async function listarDispositivos(filtros = {}) {
    const respuesta = await pedir('/api/admin/dispositivos', { query: filtros })
    return {
      dispositivos: respuesta?.dispositivos ?? [],
      total: respuesta?.total ?? 0
    }
  }

  function obtenerDispositivo(id) {
    return pedir(`/api/admin/dispositivos/${id}`)
  }

  function actualizarDispositivo(id, cambios) {
    return pedir(`/api/admin/dispositivos/${id}`, { method: 'PATCH', body: cambios })
  }

  async function listarFallos(filtros = {}) {
    const respuesta = await pedir('/api/admin/fallos', { query: filtros })
    return {
      fallos: respuesta?.fallos ?? [],
      total: respuesta?.total ?? 0
    }
  }

  function actualizarFallo(id, cambios) {
    return pedir(`/api/admin/fallos/${id}`, { method: 'PATCH', body: cambios })
  }

  return {
    resumen,
    listarPuestos,
    crearPuesto,
    actualizarPuesto,
    actualizarJefe,
    resetPin,
    listarDispositivos,
    obtenerDispositivo,
    actualizarDispositivo,
    listarFallos,
    actualizarFallo
  }
}
