/**
 * useLocalRepo(config) — Capa de repositorio local sobre server-offline.
 *
 * @param {Object} config — { tabla, puestoScoped?, customMutations? }
 */
import { getModulo } from '../server-offline/index.js'
import { useDb } from '../server-offline/db/client.js'

function readAllFromDb(targetTable, opts, auth, config) {
  const db = useDb()
  return db.queryAll(targetTable).then((all) => {
    let rows = (config?.puestoScoped && targetTable === config.tabla)
      ? all.filter(r => r.puestoId === auth?.usuarioActual?.value?.puestoId)
      : all
    const conditions = opts?.filter || opts?.query
    if (conditions) {
      for (const [key, value] of Object.entries(conditions)) {
        if (value == null || value === '' || key === 'orderBy' || key === 'orderDir') continue
        rows = rows.filter((r) => {
          const cell = r[key]
          if (typeof cell === 'string' && typeof value === 'string') {
            return cell.toLowerCase().includes(value.toLowerCase())
          }
          return String(cell ?? '') === String(value)
        })
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
  })
}

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
    return readAllFromDb(opts?.tabla || tabla, opts, auth, config)
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
    readAll: (opts) => {
      if (opts?.tabla && opts.tabla !== config.tabla) {
        return readAllFromDb(opts.tabla, opts, auth, config)
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
