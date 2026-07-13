import { $api } from '../utils/api'

/**
 * useRemoteRepo(entity) — Repositorio contra REST API.
 *
 * Deriva los endpoints desde la entity. Mismo contrato que useLocalRepo:
 *   { create, read, readAll, update, remove, patch }
 *
 * Normaliza timestamps ISO a epoch para mantener compatibilidad
 * con consumidores (useTableData).
 *
 * @param {Object} entity — entity de shared/entities
 */
function isoToEpoch(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? null : n
}

export function useRemoteRepo(entity) {
  if (!entity?.endpoints) {
    throw new Error(`useRemoteRepo: entity inválida (sin endpoints)`)
  }
  const { getHeaders } = useHeaders()
  const base = entity.endpoints

  async function crear(payload) {
    const data = await $api(base.list, {
      method: 'POST',
      body: payload,
      headers: getHeaders()
    })
    return normalizar(data)
  }

  async function leer(id) {
    const data = await $api(base.byId(id), { headers: getHeaders() })
    return normalizar(data)
  }

  async function leerTodos() {
    const list = await $api(base.list, { headers: getHeaders() })
    if (!Array.isArray(list)) {
      console.warn(`useRemoteRepo(${entity?.key ?? '?'}): se esperaba array en GET ${base.list}, recibido ${typeof list}`)
      return []
    }
    return list.map(normalizar)
  }

  async function actualizar(id, cambios) {
    const data = await $api(base.byId(id), {
      method: 'PUT',
      body: cambios,
      headers: getHeaders()
    })
    return normalizar(data)
  }

  async function eliminar(id) {
    await $api(base.byId(id), { method: 'DELETE', headers: getHeaders() })
  }

  async function parchear(id, cambios) {
    const data = await $api(base.byId(id), {
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
