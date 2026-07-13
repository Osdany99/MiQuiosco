/**
 * server-offline/api/_factory.js — createOfflineModule(entity, overrides)
 *
 * Genera el módulo CRUD offline de una entity: { list, get, create, update,
 * patch, remove, ...actions }. Sustituye a los ~6 archivos por tabla que antes
 * vivían en server-offline/api/<tabla>/.
 *
 * Lógica genérica aplicada a partir de la entity:
 * - defaults: los `default` declarados en entity.fields se aplican al crear.
 * - puestoScoped: inyecta puestoId del auth al crear y filtra por él al listar.
 * - customMutations: si la entity declara create/update custom (lógica pura JS
 *   compartida con el server online, p.ej. historial de precios), se usan.
 * - timestamps + sincronizado: creadoEn/actualizadoEn y sincronizado=0.
 *
 * Particularidades offline-only se pasan por `overrides` (no ensucian la entity,
 * que es compartida con el server online):
 * - requireRole: 'jefe'            → guardia de rol antes de crear/actualizar/borrar
 * - beforeCreate(data, auth)       → transforma el payload antes de insertar (p.ej. hashPin)
 * - beforeUpdate(cambios, auth)    → transforma los cambios antes de actualizar
 * - serialize(row)                 → transforma la fila devuelta (p.ej. ocultar pinHash)
 * - listFilter(opts, row)          → filtro extra al listar (p.ej. por fecha)
 * - actions: { nombre: fn }        → acciones custom (resetPin, getHistorial)
 *
 * @param {Object} entity - entity de shared/entities
 * @param {Object} [overrides]
 * @returns {Object} módulo { list, get, create, update, patch, remove, ...actions }
 */
import { useDb, COLUMN_MAP } from '../db/client'
import { requireJefe } from '../utils/auth'
import { inyectarPuestoId } from '../utils/inyectarPuestoId'

const ahora = () => Date.now()
const identidad = x => x

/** Valores por defecto declarados en los fields de la entity. */
function defaultsDe(entity) {
  const out = {}
  for (const [name, def] of Object.entries(entity.fields)) {
    if (def.default !== undefined) out[name] = def.default
  }
  return out
}

/**
 * Filtra un objeto dejando sólo las claves que son columnas reales de la tabla
 * (según el schema Drizzle). Evita insertar/actualizar columnas inexistentes:
 * p.ej. `pagos_fiado` y `cuentas_fiado_items` NO tienen `actualizadoEn`, y el
 * INSERT nativo fallaría. Si la tabla no está en el mapa, devuelve el objeto tal cual.
 */
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

/**
 * ctx expuesto a customMutations. En offline, insert/update enriquecen la fila
 * con id, timestamps y sincronizado=0, y `insert` devuelve la fila materializada
 * (para que el customMutation pueda usar row.id). Así el customMutation sólo
 * expresa la lógica de negocio (qué filas van a qué tablas), agnóstico del backend.
 */
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

export function createOfflineModule(entity, overrides = {}) {
  const tabla = entity.tabla
  const defaults = defaultsDe(entity)
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

  async function list(opts, auth) {
    const db = useDb()
    const all = await db.queryAll(tabla)
    let rows = all
    if (entity.puestoScoped) {
      const puestoId = auth?.usuarioActual?.value?.puestoId
      if (!puestoId) return []
      rows = rows.filter(r => r.puestoId === puestoId)
    }
    if (listFilter) rows = rows.filter(r => listFilter(opts ?? {}, r))
    if (opts?.orderBy) {
      const dir = opts.orderDir === 'desc' ? -1 : 1
      rows = [...rows].sort((a, b) => {
        const va = a[opts.orderBy] ?? ''
        const vb = b[opts.orderBy] ?? ''
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
    if (entity.puestoScoped) payload = inyectarPuestoId(payload, auth)
    payload = await beforeCreate(payload, auth)

    if (entity.customMutations?.create) {
      const row = await entity.customMutations.create(makeCtx(), payload, auth)
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

    if (entity.customMutations?.update) {
      const row = await entity.customMutations.update(makeCtx(), id, payload, auth)
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
