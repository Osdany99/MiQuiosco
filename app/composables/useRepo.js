/**
 * useRepo(entity) — Repositorio agnóstico del backend.
 *
 * Acepta una entity de shared/entities y resuelve online/offline según
 * el modo de conexión actual. Devuelve un shape uniforme:
 *   { create, read, readAll, update, patch, remove }
 *
 * Convención: useRepo(entity) — el primer arg es el OBJETO entity, no un string.
 *
 * @param {Object} entity — entity de shared/entities (ej: producto, cliente)
 * @returns {Object} { create, read, readAll, update, patch, remove }
 */
export function useRepo(entity) {
  if (!entity || !entity.tabla) {
    throw new Error('useRepo: se requiere un objeto entity con .tabla')
  }
  const conexion = useModoConexion()
  const localRepo = useLocalRepo(entity)
  const remoteRepo = useRemoteRepo(entity)
  const repo = computed(() => {
    if (conexion.modo.value === 'online') return remoteRepo
    return localRepo
  })
  return {
    create: (...args) => repo.value.create(...args),
    read: (...args) => repo.value.read(...args),
    readAll: (...args) => repo.value.readAll(...args),
    update: (...args) => repo.value.update(...args),
    patch: (...args) => repo.value.patch(...args),
    remove: (...args) => repo.value.remove(...args)
  }
}
