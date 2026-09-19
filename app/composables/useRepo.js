/**
 * useRepo(config) — Repositorio agnóstico del backend con loading/error/toast de error.
 *
 * Acepta un objeto de config con { tabla, endpoints?, puestoScoped?, customMutations? }
 * y resuelve online/offline según el modo de conexión actual.
 *
 * @param {Object} config — { tabla, endpoints?, puestoScoped?, customMutations? }
 * @param {Object} [opts]
 * @param {boolean} [opts.toast=true] — mostrar toast de error
 * @returns {Object}
 */
export function useRepo(config, { toast = true } = {}) {
  if (!config || !config.tabla) {
    throw new Error('useRepo: se requiere config.tabla')
  }
  const conexion = useModoConexion()
  const localRepo = useLocalRepo(config)
  const remoteRepo = useRemoteRepo(config)
  const repo = computed(() => {
    if (conexion.modo.value === 'online') return remoteRepo
    return localRepo
  })

  const loading = ref(false)
  const error = ref(null)
  const callbacksExito = new Set()
  const toastNotification = useToast()

  async function ejecutar(fn, args) {
    loading.value = true
    error.value = null
    try {
      const result = await fn(...args)
      for (const cb of callbacksExito) cb(result, 'success')
      return { data: result, error: null }
    } catch (err) {
      error.value = err
      if (toast) {
        toastNotification.add({ title: 'Error', description: err.message, color: 'error' })
      }
      for (const cb of callbacksExito) cb(err, 'error')
      return { data: null, error: err }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    onSuccess(cb) {
      callbacksExito.add(cb)
      return () => callbacksExito.delete(cb)
    },
    create: datos => ejecutar(repo.value.create, [datos]),
    read: id => ejecutar(repo.value.read, [id]),
    readAll: opts => ejecutar(repo.value.readAll, [opts ?? {}]),
    update: (id, cambios) => ejecutar(repo.value.update, [id, cambios]),
    patch: (id, cambios) => ejecutar(repo.value.patch, [id, cambios]),
    remove: id => ejecutar(repo.value.remove, [id])
  }
}
