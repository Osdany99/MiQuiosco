export function useRepo(tabla) {
  const conexion = useModoConexion()
  const localRepo = useLocalRepo(tabla)
  const remoteRepo = useRemoteRepo(tabla)
  const repo = computed(() =>
    conexion.modo.value === 'online' ? remoteRepo : localRepo
  )
  return {
    create: (...args) => repo.value.create(...args),
    read: (...args) => repo.value.read(...args),
    readAll: (...args) => repo.value.readAll(...args),
    update: (...args) => repo.value.update(...args),
    patch: (...args) => repo.value.patch(...args),
    remove: (...args) => repo.value.remove(...args)
  }
}
