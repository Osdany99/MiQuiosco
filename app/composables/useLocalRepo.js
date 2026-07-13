/**
 * useLocalRepo(entity) — Capa de repositorio local sobre server-offline.
 *
 * Si la tabla tiene un módulo dedicado en app/server-offline/api/<tabla>/, lo usa.
 * Si no, cae a un wrapper CRUD genérico sobre useDb().
 *
 * Las escrituras generan id, timestamps y marca sincronizado = 0
 * para que el sync eventual los recoja.
 */
import { getModulo } from '../server-offline/index.js'
import { useDb } from '../server-offline/db/client.js'

/**
 * Construye un CRUD genérico para tablas sin módulo dedicado.
 * Usa customMutations si la entity las declara (ej: producto → historial_precios).
 */
function crearRepoGenerico(entity) {
  const tabla = entity.tabla
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
    if (entity.customMutations?.create) {
      return entity.customMutations.create(ctx(), datos, auth)
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
    let rows = entity.puestoScoped
      ? all.filter(r => r.puestoId === auth?.usuarioActual?.value?.puestoId)
      : all
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
    if (entity.customMutations?.update) {
      return entity.customMutations.update(ctx(), id, cambios, auth)
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

/** Operaciones CRUD estándar del módulo offline (se mapean a create/read/...). */
const OPS_ESTANDAR = new Set(['list', 'get', 'create', 'update', 'patch', 'remove'])

/**
 * Construye un repositorio a partir del módulo generado por el factory offline.
 * Pasa auth al create/update/patch/remove (que pueden requerirlo). Además
 * reexpone tal cual cualquier acción custom del módulo (getHistorial, resetPin, …)
 * inyectando auth como último argumento.
 */
function crearRepoDesdeModulo(entity, modulo) {
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

  // Acciones custom (definidas en overrides.actions del factory): getHistorial, resetPin…
  for (const [nombre, fn] of Object.entries(modulo)) {
    if (OPS_ESTANDAR.has(nombre) || typeof fn !== 'function') continue
    repo[nombre] = (...args) => call(fn, args)
  }

  return repo
}

export function useLocalRepo(entity) {
  if (!entity?.tabla) {
    throw new Error('useLocalRepo: se requiere un objeto entity con .tabla')
  }
  const modulo = getModulo(entity.tabla)

  if (modulo) return crearRepoDesdeModulo(entity, modulo)
  return crearRepoGenerico(entity)
}
