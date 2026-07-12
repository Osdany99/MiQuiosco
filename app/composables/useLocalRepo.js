/**
 * useLocalRepo(tabla) — Capa de repositorio local sobre api-offline.
 *
 * Si la tabla tiene un módulo dedicado en app/api-offline/<tabla>/, lo usa.
 * Si no, cae a un wrapper CRUD genérico sobre useDb().
 *
 * Las escrituras generan id, timestamps y marca sincronizado = 0
 * para que el sync eventual los recoja.
 */
import { getModulo } from '../api-offline'
import { useDb } from '../db-offline/client'

/**
 * Construye un repositorio CRUD genérico para tablas sin módulo dedicado.
 * @param {string} tabla
 */
function crearRepoGenerico(tabla) {
  const db = useDb()
  const ahora = () => Date.now()

  async function create(datos) {
    const registro = {
      id: crypto.randomUUID(),
      ...datos,
      creado_en: datos.creado_en ?? ahora(),
      actualizado_en: datos.actualizado_en ?? ahora(),
      sincronizado: datos.sincronizado ?? 0
    }
    await db.insert(tabla, registro)
    return registro
  }

  async function read(id) {
    return db.getById(tabla, id)
  }

  async function readAll(opts) {
    const rows = await db.queryAll(tabla)
    if (opts?.orderBy) {
      const dir = opts.orderDir === 'desc' ? -1 : 1
      rows.sort((a, b) => {
        const va = a[opts.orderBy] ?? ''
        const vb = b[opts.orderBy] ?? ''
        return typeof va === 'string'
          ? va.localeCompare(vb) * dir
          : (va - vb) * dir
      })
    }
    return rows
  }

  async function update(id, cambios) {
    await db.update(tabla, id, {
      ...cambios,
      sincronizado: 0,
      actualizado_en: ahora()
    })
  }

  async function remove(id) {
    await db.remove(tabla, id)
  }

  return { create, read, readAll, update, patch: update, remove }
}

/**
 * Construye un repositorio a partir del módulo de api-offline/<tabla>/.
 * Pasa auth al create/update/patch/remove (que pueden requerirlo).
 * @param {object} modulo
 */
function crearRepoDesdeModulo(modulo) {
  const auth = useAuth()

  async function call(fn, args) {
    if (typeof fn !== 'function') {
      throw new Error(`Operación no implementada en módulo offline: ${fn?.name ?? 'unknown'}`)
    }
    return fn(...args, auth)
  }

  return {
    create: datos => call(modulo.create, [datos]),
    read: id => call(modulo.get, [id]),
    readAll: opts => call(modulo.list, [opts ?? {}]),
    update: (id, cambios) => call(modulo.update, [id, cambios]),
    patch: (id, cambios) => call(modulo.patch, [id, cambios]),
    remove: id => call(modulo.remove, [id])
  }
}

export function useLocalRepo(tabla) {
  const modulo = getModulo(tabla)
  if (modulo) return crearRepoDesdeModulo(modulo)
  return crearRepoGenerico(tabla)
}
