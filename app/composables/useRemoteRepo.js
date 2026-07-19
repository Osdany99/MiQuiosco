import { $api } from '../utils/api'

/**
 * useRemoteRepo(config) — Repositorio contra REST API.
 *
 * @param {Object} config — { endpoints: { list, byId } }
 */
function isoToEpoch(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? null : n
}

export function useRemoteRepo(config) {
  if (!config?.endpoints) {
    throw new Error('useRemoteRepo: se requiere config.endpoints')
  }
  const auth = useAuth()
  const base = config.endpoints

  function getHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

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

  async function leerTodos(opts) {
    let url
    if (opts?.endpoint) {
      url = typeof opts.endpoint === 'function' ? opts.endpoint() : opts.endpoint
    } else {
      url = base.list
      if (opts?.query && Object.keys(opts.query).length) {
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(opts.query)) {
          if (v != null && v !== '') params.set(k, String(v))
        }
        const qs = params.toString()
        if (qs) url = `${url}?${qs}`
      }
    }
    const list = await $api(url, { headers: getHeaders() })
    if (!Array.isArray(list)) {
      console.warn(`useRemoteRepo(${config?.tabla ?? '?'}): se esperaba array en GET ${url}, recibido ${typeof list}`)
      return []
    }
    return list.map(normalizar)
  }

  async function actualizar(id, cambios) {
    const data = await $api(base.byId(id), {
      method: 'PATCH',
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
    if ('cerradoEn' in out) out.cerradoEn = isoToEpoch(out.cerradoEn)
    if ('ultimaReaperturaEn' in out) out.ultimaReaperturaEn = isoToEpoch(out.ultimaReaperturaEn)
    if ('vigenteDesde' in out) out.vigenteDesde = isoToEpoch(out.vigenteDesde)
    if ('vigenteHasta' in out) out.vigenteHasta = isoToEpoch(out.vigenteHasta)
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
