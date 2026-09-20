/**
 * useLocalRepo(config) — Capa de repositorio local sobre server-offline.
 *
 * @param {Object} config — { tabla, puestoScoped?, customMutations? }
 */
import { getModulo } from '../server-offline/index.js'
import { useDb } from '../server-offline/db/client'
import { makeCtx, queryFromDb, enrichForInsert, enrichForUpdate } from '../server-offline/api/_factory.js'

function crearRepoGenerico(config) {
  const tabla = config.tabla
  const auth = useAuth()

  async function create(datos) {
    if (config.customMutations?.create) {
      return config.customMutations.create(makeCtx(), datos, auth)
    }
    const db = useDb()
    const registro = enrichForInsert(tabla, datos)
    await db.insert(tabla, registro)
    return registro
  }

  async function read(id) {
    return useDb().getById(tabla, id)
  }

  async function readAll(opts) {
    return queryFromDb(opts?.tabla || tabla, opts, auth, config)
  }

  async function update(id, cambios) {
    if (config.customMutations?.update) {
      return config.customMutations.update(makeCtx(), id, cambios, auth)
    }
    return useDb().update(tabla, id, enrichForUpdate(tabla, cambios))
  }

  async function remove(id) {
    return useDb().remove(tabla, id)
  }

  return { create, read, readAll, update, patch: update, remove }
}

const OPS_ESTANDAR = new Set(['list', 'get', 'create', 'update', 'patch', 'remove'])

function crearRepoDesdeModulo(config, modulo) {
  const auth = useAuth()

  async function call(fn, args) {
    if (typeof fn !== 'function') {
      throw new Error(`Operación no implementada en módulo offline: ${fn?.name ?? 'unknown'}`)
    }
    return fn(...args, auth)
  }

  const repo = {
    create: datos => call(modulo.create, [datos]),
    read: id => call(modulo.get, [id]),
    readAll: (opts) => {
      if (opts?.tabla && opts.tabla !== config.tabla) {
        return queryFromDb(opts.tabla, opts, auth, config)
      }
      return call(modulo.list, [opts ?? {}])
    },
    update: (id, cambios) => call(modulo.update, [id, cambios]),
    patch: (id, cambios) => call(modulo.patch, [id, cambios]),
    remove: id => call(modulo.remove, [id])
  }

  for (const [nombre, fn] of Object.entries(modulo)) {
    if (OPS_ESTANDAR.has(nombre) || typeof fn !== 'function') continue
    repo[nombre] = (...args) => call(fn, args)
  }

  return repo
}

export function useLocalRepo(config) {
  if (!config?.tabla) {
    throw new Error('useLocalRepo: se requiere config.tabla')
  }
  const modulo = getModulo(config.tabla)

  if (modulo) return crearRepoDesdeModulo(config, modulo)
  return crearRepoGenerico(config)
}
