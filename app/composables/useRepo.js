import { toastMsg } from '~/utils/toast'

/**
 * useRepo(config) — Repositorio agnóstico del backend con loading/error/toast.
 *
 * Acepta un objeto de config con { tabla, endpoints?, puestoScoped?, customMutations? }
 * y resuelve online/offline según el modo de conexión actual.
 *
 * @param {Object} config — { tabla, endpoints?, puestoScoped?, customMutations? }
 * @param {Object} [opts]
 * @param {boolean} [opts.toast=true] — mostrar toast de éxito/error
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
  const label = config?.label

  async function ejecutar(fn, args, { title } = {}) {
    loading.value = true
    error.value = null
    try {
      const result = await fn(...args)
      if (toast && title) {
        toastNotification.add({ title, color: 'primary' })
      }
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
    create: (datos, opts) => ejecutar(repo.value.create, [datos], { title: opts?.toastTitle ?? (label ? toastMsg('created', label) : 'Creado correctamente') }),
    read: (id, opts) => ejecutar(repo.value.read, [id], { title: opts?.toastTitle ?? (label ? toastMsg('read', label) : 'Registro obtenido correctamente') }),
    readAll: (opts, callOpts) => ejecutar(repo.value.readAll, [opts ?? {}], { title: callOpts?.toastTitle ?? (label ? toastMsg('readAll', label) : 'Datos cargados correctamente') }),
    update: (id, cambios, opts) => ejecutar(repo.value.update, [id, cambios], { title: opts?.toastTitle ?? (label ? toastMsg('updated', label) : 'Actualizado correctamente') }),
    patch: (id, cambios, opts) => ejecutar(repo.value.patch, [id, cambios], { title: opts?.toastTitle ?? (label ? toastMsg('updated', label) : 'Actualizado correctamente') }),
    remove: (id, opts) => ejecutar(repo.value.remove, [id], { title: opts?.toastTitle ?? (label ? toastMsg('deleted', label) : 'Eliminado correctamente') })
  }
}
