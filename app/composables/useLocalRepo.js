/**
 * useLocalRepo(config) — Capa de repositorio local sobre server-offline.
 *
 * @param {Object} config — { tabla, puestoScoped?, customMutations? }
 */
import { getModulo } from '../server-offline/index.js'
import { useDb } from '../server-offline/db/client.js'

function crearRepoGenerico(config) {
  const tabla = config.tabla
  const auth = useAuth()
  const ahora = () => Date.now()

  function ctx() {
    const db = useDb()
    return {
      insert: (t, data) => db.insert(t, data),
      update: (t, id, cambios) => db.update(t, id, cambios),
      get: (t, id) => db.getById(t, id),
      queryAll: t => db.queryAll(t)
    }
  }

  async function create(datos) {
    if (config.customMutations?.create) {
      return config.customMutations.create(ctx(), datos, auth)
    }
    const db = useDb()
    const registro = {
      id: crypto.randomUUID(),
      ...datos,
      creadoEn: datos.creadoEn ?? ahora(),
      actualizadoEn: datos.actualizadoEn ?? ahora(),
      sincronizado: datos.sincronizado ?? 0
    }
    await db.insert(tabla, registro)
    return registro
  }

  async function read(id) {
    return useDb().getById(tabla, id)
  }

  async function readAll(opts) {
    const db = useDb()
    const all = await db.queryAll(tabla)
    let rows = config.puestoScoped
      ? all.filter(r => r.puestoId === auth?.usuarioActual?.value?.puestoId)
      : all
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value != null && value !== '') {
          rows = rows.filter(r => String(r[key] ?? '') === String(value))
        }
      }
    }
    if (opts?.orderBy) {
      const dir = opts.orderDir === 'desc' ? -1 : 1
      rows = [...rows].sort((a, b) => {
        const va = a[opts.orderBy] ?? ''
        const vb = b[opts.orderBy] ?? ''
        return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
      })
    }
    return rows
  }

  async function update(id, cambios) {
    if (config.customMutations?.update) {
      return config.customMutations.update(ctx(), id, cambios, auth)
    }
    return useDb().update(tabla, id, {
      ...cambios,
      sincronizado: 0,
      actualizadoEn: ahora()
    })
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
    readAll: opts => call(modulo.list, [opts ?? {}]),
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
