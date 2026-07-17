/**
 * server-offline/api/_factory.js — createOfflineModule(config, overrides)
 *
 * Genera el módulo CRUD offline: { list, get, create, update, patch, remove, ...actions }.
 *
 * @param {Object} config — { tabla, defaults?, puestoScoped?, customMutations? }
 * @param {Object} [overrides]
 * @returns {Object} módulo { list, get, create, update, patch, remove, ...actions }
 */
import { useDb, COLUMN_MAP } from '../db/client'
import { requireJefe } from '../utils/auth'
import { inyectarPuestoId } from '../utils/inyectarPuestoId'

const ahora = () => Date.now()
const identidad = x => x

function pruneToColumns(tabla, obj) {
  const known = COLUMN_MAP?.[tabla]
  if (!known) return obj
  const knownCamel = new Set(Object.keys(known))
  const knownSnake = new Set(Object.values(known))
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (knownCamel.has(k) || knownSnake.has(k)) out[k] = v
  }
  return out
}

function makeCtx() {
  const db = useDb()
  const enrich = (t, data) => pruneToColumns(t, {
    id: data.id ?? crypto.randomUUID(),
    ...data,
    creadoEn: data.creadoEn ?? ahora(),
    actualizadoEn: data.actualizadoEn ?? ahora(),
    sincronizado: 0
  })
  return {
    insert: async (t, data) => {
      const row = enrich(t, data)
      await db.insert(t, row)
      return row
    },
    update: (t, id, cambios) => db.update(t, id, pruneToColumns(t, { ...cambios, actualizadoEn: ahora(), sincronizado: 0 })),
    get: (t, id) => db.getById(t, id),
    queryAll: t => db.queryAll(t)
  }
}

export function createOfflineModule(config, overrides = {}) {
  const tabla = config.tabla
  const defaults = config.defaults ?? {}
  const {
    requireRole,
    beforeCreate = identidad,
    beforeUpdate = identidad,
    serialize = identidad,
    listFilter,
    actions = {}
  } = overrides

  function guard(auth) {
    if (requireRole === 'jefe') requireJefe(auth)
  }

  function matchValue(val, filter) {
    if (filter == null || filter === '') return true
    const s = String(val ?? '')
    const f = String(filter)
    return s.toLowerCase().includes(f.toLowerCase())
  }

  async function list(opts, auth) {
    const db = useDb()
    const all = await db.queryAll(tabla)
    let rows = all
    if (config.puestoScoped) {
      const puestoId = auth?.usuarioActual?.value?.puestoId
      if (!puestoId) return []
      rows = rows.filter(r => r.puestoId === puestoId)
    }
    const filterSource = opts?.filter || opts?.query
    if (filterSource) {
      for (const [key, value] of Object.entries(filterSource)) {
        if (value == null || value === '' || key === 'orderBy' || key === 'orderDir') continue
        rows = rows.filter(r => matchValue(r[key], value))
      }
    }
    if (listFilter) rows = rows.filter(r => listFilter(opts ?? {}, r))
    const orderBy = opts?.orderBy ?? opts?.query?.orderBy
    if (orderBy) {
      const dir = (opts?.orderDir ?? opts?.query?.orderDir) === 'desc' ? -1 : 1
      rows = [...rows].sort((a, b) => {
        const va = a[orderBy] ?? ''
        const vb = b[orderBy] ?? ''
        return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
      })
    }
    return rows.map(serialize)
  }

  async function get(id, _auth) {
    void _auth
    const row = await useDb().getById(tabla, id)
    return row ? serialize(row) : null
  }

  async function create(datos, auth) {
    guard(auth)
    let payload = { ...defaults, ...datos }
    if (config.puestoScoped) payload = inyectarPuestoId(payload, auth)
    payload = await beforeCreate(payload, auth)

    if (config.customMutations?.create) {
      const row = await config.customMutations.create(makeCtx(), payload, auth)
      return serialize(row)
    }

    const db = useDb()
    const registro = pruneToColumns(tabla, {
      id: crypto.randomUUID(),
      ...payload,
      creadoEn: payload.creadoEn ?? ahora(),
      actualizadoEn: payload.actualizadoEn ?? ahora(),
      sincronizado: 0
    })
    await db.insert(tabla, registro)
    return serialize(registro)
  }

  async function update(id, cambios, auth) {
    guard(auth)
    const payload = await beforeUpdate({ ...cambios }, auth)

    if (config.customMutations?.update) {
      const row = await config.customMutations.update(makeCtx(), id, payload, auth)
      return serialize(row)
    }

    const db = useDb()
    await db.update(tabla, id, pruneToColumns(tabla, { ...payload, actualizadoEn: ahora(), sincronizado: 0 }))
    const row = await db.getById(tabla, id)
    return serialize(row)
  }

  function patch(id, cambios, auth) {
    return update(id, cambios, auth)
  }

  async function remove(id, auth) {
    guard(auth)
    await useDb().remove(tabla, id)
  }

  return { list, get, create, update, patch, remove, ...actions }
}
