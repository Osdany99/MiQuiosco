/**
 * server-offline/api/_factory.js — createOfflineModule(config, overrides)
 *
 * Genera el módulo CRUD offline: { list, get, create, update, patch, remove, ...actions }.
 *
 * @param {Object} config — { tabla, defaults?, puestoScoped?, customMutations? }
 * @param {Object} [overrides]
 * @returns {Object} módulo { list, get, create, update, patch, remove, ...actions }
 */
import { Preferences } from '@capacitor/preferences'
import { useDb, COLUMN_MAP, TIMESTAMP_COLS } from '../db/client'
import { requireJefe } from '../utils/auth'
import { inyectarPuestoId } from '../utils/inyectarPuestoId'
import { generateId } from '../../utils/id'
import { normalizarFechas, aEpochOpcional } from '../../../shared/fechas'

const PREF_PENDING_DELETES = 'pending_deletes'
let _pendingDeletesCache = null

async function loadPendingDeletes() {
  if (_pendingDeletesCache !== null) return _pendingDeletesCache
  const stored = await Preferences.get({ key: PREF_PENDING_DELETES })
  _pendingDeletesCache = stored.value ? JSON.parse(stored.value) : []
  return _pendingDeletesCache
}

async function savePendingDeletes(deletes) {
  _pendingDeletesCache = deletes
  await Preferences.set({ key: PREF_PENDING_DELETES, value: JSON.stringify(deletes) })
}

export async function addPendingDelete(tabla, id) {
  const deletes = await loadPendingDeletes()
  if (!deletes.some(d => d.tabla === tabla && d.id === id)) {
    deletes.push({ tabla, id })
    await savePendingDeletes(deletes)
  }
}

export async function removePendingDeletesAccepted(accepted) {
  const deletes = await loadPendingDeletes()
  const idsSet = new Set(accepted.map(d => `${d.tabla}:${d.id}`))
  const filtered = deletes.filter(d => !idsSet.has(`${d.tabla}:${d.id}`))
  await savePendingDeletes(filtered)
}

export async function getPendingDeletes() {
  return await loadPendingDeletes()
}

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

/**
 * Deja la fila lista para SQLite: solo columnas conocidas, marca de tiempo en
 * epoch ms y `sincronizado` por defecto en 0 (lo local nace pendiente de subir).
 *
 * La normalización de fechas es el punto donde el ISO del servidor se vuelve
 * número. Sin ella el ISO acaba en una columna `integer` (ver shared/fechas.js).
 */
export function enrichForInsert(tabla, data) {
  return normalizarFechas(pruneToColumns(tabla, {
    id: data.id ?? generateId(),
    ...data,
    creadoEn: data.creadoEn ?? ahora(),
    actualizadoEn: data.actualizadoEn ?? ahora(),
    sincronizado: data.sincronizado ?? 0
  }), TIMESTAMP_COLS[tabla] ?? [])
}

/** Campos que pertenecen al canal de sincronización, no a la edición del usuario. */
const CAMPOS_DE_SYNC = ['id', 'creadoEn', 'actualizadoEn', 'sincronizado']

/**
 * Edición local: la fila queda SIEMPRE pendiente de subir y con la fecha de
 * ahora. Sin esto, un formulario que reenvía la fila entera (trae
 * `sincronizado: 1` y el `actualizadoEn` viejo) nace marcada como ya
 * sincronizada: el push la descarta por timestamp y el siguiente pull le
 * devuelve el valor del servidor. El cambio se pierde sin error visible —
 * precio guardado en pantalla y revertido al cerrar.
 */
export function enrichForUpdate(tabla, cambios) {
  const limpios = { ...cambios }
  for (const campo of CAMPOS_DE_SYNC) delete limpios[campo]
  return normalizarFechas(pruneToColumns(tabla, {
    ...limpios,
    actualizadoEn: ahora(),
    sincronizado: 0
  }), TIMESTAMP_COLS[tabla] ?? [])
}

/**
 * Aplicar lo que YA VIENE del servidor (pull, marcar aceptados, absorber
 * conflictos): aquí sí se respeta su marca de tiempo y la fila queda
 * sincronizada. Es el contrapunto de enrichForUpdate — usar uno donde tocaría
 * el otro es exactamente el bug del precio que se revierte.
 */
export function enrichForSync(tabla, cambios) {
  return normalizarFechas(pruneToColumns(tabla, {
    ...cambios,
    actualizadoEn: cambios.actualizadoEn ?? ahora(),
    sincronizado: cambios.sincronizado ?? 1
  }), TIMESTAMP_COLS[tabla] ?? [])
}

export function makeCtx() {
  const db = useDb()
  return {
    insert: async (t, data) => {
      const row = enrichForInsert(t, data)
      await db.insert(t, row)
      return row
    },
    update: (t, id, cambios) => db.update(t, id, enrichForUpdate(t, cambios)),
    get: (t, id) => db.getById(t, id),
    queryAll: t => db.queryAll(t),
    findHistorialVigente: productoId => db.findHistorialVigente(productoId),
    findHistorialAbiertos: productoId => db.findHistorialAbiertos(productoId)
  }
}

function matchValue(val, filter) {
  if (filter == null || filter === '') return true
  const s = String(val ?? '')
  const f = String(filter)
  return s.toLowerCase().includes(f.toLowerCase())
}

/**
 * Claves de rango de fechas: no son columnas, así que el filtrado por
 * substring de abajo las descartaría y dejaría la lista vacía. Mapean a
 * `creadoEn` con comparación inclusiva.
 */
const COLUMNAS_RANGO = { desde: 'creadoEn', hasta: 'creadoEn', fechaDesde: 'creadoEn', fechaHasta: 'creadoEn' }
const RESERVADAS = new Set(['orderBy', 'orderDir', ...Object.keys(COLUMNAS_RANGO)])

/** Acepta epoch ms (SQLite) o una fecha ISO (remoto) y devuelve milisegundos. */
const aMilisegundos = aEpochOpcional

export async function queryFromDb(tabla, opts, auth, config) {
  const db = useDb()
  const all = await db.queryAll(tabla)
  let rows = all
  if (config?.puestoScoped) {
    const puestoId = auth?.usuarioActual?.value?.puestoId
    if (!puestoId) return []
    rows = rows.filter(r => r.puestoId === puestoId)
  }
  const filterSource = opts?.filter || opts?.query
  if (filterSource) {
    for (const [key, value] of Object.entries(filterSource)) {
      if (value == null || value === '') continue
      const columnaRango = COLUMNAS_RANGO[key]
      if (columnaRango) {
        const limite = aMilisegundos(value)
        if (limite == null) continue
        rows = rows.filter((r) => {
          const v = aMilisegundos(r[columnaRango])
          if (v == null) return false
          return key === 'desde' || key === 'fechaDesde' ? v >= limite : v <= limite
        })
        continue
      }
      if (RESERVADAS.has(key)) continue
      rows = rows.filter(r => matchValue(r[key], value))
    }
  }
  const orderBy = opts?.orderBy ?? opts?.query?.orderBy
  if (orderBy) {
    const dir = (opts?.orderDir ?? opts?.query?.orderDir) === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => {
      const va = a[orderBy] ?? ''
      const vb = b[orderBy] ?? ''
      return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
    })
  }
  return rows
}

export function createOfflineModule(config, overrides = {}) {
  const tabla = config.tabla
  const defaults = config.defaults ?? {}
  const {
    requireRole,
    beforeCreate = identidad,
    beforeUpdate = identidad,
    beforeRemove = null,
    serialize = identidad,
    listFilter,
    actions = {}
  } = overrides

  function guard(auth) {
    if (requireRole === 'jefe') requireJefe(auth)
  }

  async function list(opts, auth) {
    guard(auth)
    let rows = await queryFromDb(tabla, opts, auth, config)
    if (listFilter) rows = rows.filter(r => listFilter(opts ?? {}, r))
    return rows.map(serialize)
  }

  async function get(id, auth) {
    guard(auth)
    const row = await useDb().getById(tabla, id)
    return row ? serialize(row) : null
  }

  async function create(datos, auth) {
    guard(auth)
    let payload = { ...defaults, ...datos }
    if (config.puestoScoped) payload = inyectarPuestoId(payload, auth)
    payload = await beforeCreate(payload, auth)

    if (config.customMutations?.create) {
      // Una mutación de varias tablas (productos → historial_precios) sin
      // transacción deja la primera guardada aunque la segunda reviente: el
      // usuario ve el precio cambiado y no existe registro del cambio.
      const row = await useDb().transaction(() => config.customMutations.create(makeCtx(), payload, auth))
      return serialize(row)
    }

    const db = useDb()
    const registro = enrichForInsert(tabla, payload)
    await db.insert(tabla, registro)
    return serialize(registro)
  }

  async function update(id, cambios, auth) {
    guard(auth)
    // El id se pasa al hook para que los guards puedan distinguir a quién se
    // está editando del usuario autenticado (ver guard del último jefe).
    const payload = await beforeUpdate({ ...cambios }, auth, id)

    if (config.customMutations?.update) {
      const row = await useDb().transaction(() => config.customMutations.update(makeCtx(), id, payload, auth))
      return serialize(row)
    }

    const db = useDb()
    await db.update(tabla, id, enrichForUpdate(tabla, payload))
    const row = await db.getById(tabla, id)
    return serialize(row)
  }

  function patch(id, cambios, auth) {
    return update(id, cambios, auth)
  }

  async function remove(id, auth) {
    guard(auth)
    if (beforeRemove) await beforeRemove(id, auth)
    await useDb().remove(tabla, id)
    await addPendingDelete(tabla, id)
  }

  return { list, get, create, update, patch, remove, ...actions }
}
