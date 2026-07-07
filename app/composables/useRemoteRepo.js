/**
 * useRemoteRepo(tabla) — Repositorio contra REST API.
 *
 * Mismo contrato que useLocalRepo:
 *   { create, read, readAll, update, remove, patch }
 *
 * Normaliza timestamps ISO a epoch para mantener compatibilidad
 * con consumidores (useCrud, useTableData).
 */

function isoToEpoch(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? null : n
}

const MAPA_ENDPOINTS = {
  productos: API.productos,
  usuarios: API.usuarios,
  cuadres: API.cuadres,
  cuadre_items: API.itemsCuadre
}

export function useRemoteRepo(tabla) {
  const { getHeaders } = useHeaders()

  const baseUrl = MAPA_ENDPOINTS[tabla]
  if (!baseUrl) {
    throw new Error(`useRemoteRepo: tabla "${tabla}" no tiene endpoint mapeado`)
  }

  async function crear(payload) {
    const data = await $fetch(baseUrl.list, {
      method: 'POST',
      body: payload,
      headers: getHeaders()
    })
    return normalizar(data)
  }

  async function leer(id) {
    const data = await $fetch(baseUrl.byId(id), {
      headers: getHeaders()
    })
    return normalizar(data)
  }

  async function leerTodos() {
    const list = await $fetch(baseUrl.list, {
      headers: getHeaders()
    })
    return (list ?? []).map(normalizar)
  }

  async function actualizar(id, cambios) {
    const data = await $fetch(baseUrl.byId(id), {
      method: 'PUT',
      body: cambios,
      headers: getHeaders()
    })
    return normalizar(data)
  }

  async function eliminar(id) {
    await $fetch(baseUrl.byId(id), {
      method: 'DELETE',
      headers: getHeaders()
    })
  }

  async function parchear(id, cambios) {
    const data = await $fetch(baseUrl.byId(id), {
      method: 'PATCH',
      body: cambios,
      headers: getHeaders()
    })
    return normalizar(data)
  }

  function normalizar(r) {
    if (!r || typeof r !== 'object') return r
    const out = { ...r }
    if ('creadoEn' in out) out.creadoEn = isoToEpoch(out.creadoEn) ?? Date.now()
    if ('actualizadoEn' in out) out.actualizadoEn = isoToEpoch(out.actualizadoEn) ?? Date.now()
    return out
  }

  return {
    create: crear,
    read: leer,
    readAll: leerTodos,
    update: actualizar,
    remove: eliminar,
    patch: parchear
  }
}
