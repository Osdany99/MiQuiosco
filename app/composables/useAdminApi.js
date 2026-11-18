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
        await navigateTo({ path: '/login', query: { reason: 'session_expired' } })
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

  function resumenVoz() {
    return pedir('/api/admin/voz/resumen')
  }

  function listarEventosVoz(filtros = {}) {
    return pedir('/api/admin/voz/eventos', { query: filtros })
  }

  function marcarEventoVoz(id, estado) {
    return pedir(`/api/admin/voz/eventos/${id}`, { method: 'PATCH', body: { estado } })
  }

  function limpiarEventosVoz() {
    return pedir('/api/admin/voz/limpiar', { method: 'POST' })
  }

  function listarAciertosVoz(filtros = {}) {
    return pedir('/api/admin/voz/aciertos', { query: filtros })
  }

  function limpiarAciertosVoz() {
    return pedir('/api/admin/voz/aciertos/limpiar', { method: 'POST' })
  }

  function listarConfirmacionesVoz(filtros = {}) {
    return pedir('/api/admin/voz/confirmaciones', { query: filtros })
  }

  function listarLexicoVoz() {
    return pedir('/api/admin/voz/lexico')
  }

  function crearEntradaLexicoVoz(datos) {
    return pedir('/api/admin/voz/lexico', { method: 'POST', body: datos })
  }

  function actualizarEntradaLexicoVoz(id, cambios) {
    return pedir(`/api/admin/voz/lexico/${id}`, { method: 'PATCH', body: cambios })
  }

  function obtenerConfigVoz() {
    return pedir('/api/voz/config')
  }

  function guardarConfigVoz(datos) {
    return pedir('/api/voz/config', { method: 'PUT', body: datos })
  }

  function obtenerVozDispositivo(id) {
    return pedir(`/api/admin/dispositivos/${id}/voz`)
  }

  function guardarVozDispositivo(id, datos) {
    return pedir(`/api/admin/dispositivos/${id}/voz`, { method: 'PATCH', body: datos })
  }

  function guardarVozPuesto(datos) {
    return pedir('/api/admin/dispositivos/voz-puesto', { method: 'PATCH', body: datos })
  }

  async function listarDispositivosConVozPropia() {
    const respuesta = await pedir('/api/admin/voz/dispositivos')
    return respuesta?.overrides ?? []
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
    actualizarFallo,
    listarEventosVoz,
    resumenVoz,
    marcarEventoVoz,
    limpiarEventosVoz,
    listarAciertosVoz,
    limpiarAciertosVoz,
    listarConfirmacionesVoz,
    listarLexicoVoz,
    crearEntradaLexicoVoz,
    actualizarEntradaLexicoVoz,
    obtenerConfigVoz,
    guardarConfigVoz,
    obtenerVozDispositivo,
    guardarVozDispositivo,
    guardarVozPuesto,
    listarDispositivosConVozPropia
  }
}
