/**
 * useRepoAction(entity, opts) — Wrapper sobre useRepo con loading/error/toast/onSuccess.
 *
 * Acepta entity (de shared/entities) en lugar de un string de tabla.
 *
 * @param {Object} entity - Entity de shared/entities
 * @param {Object} [opts]
 * @param {boolean} [opts.toast=true] - mostrar toast de éxito/error
 * @returns {Object} { loading, error, onSuccess, create, read, readAll, update, patch, remove }
 */
export function useRepoAction(entity, { toast = true } = {}) {
  const repo = useRepo(entity)
  const loading = ref(false)
  const error = ref(null)
  const callbacksExito = new Set()

  async function ejecutar(fn, args) {
    loading.value = true
    error.value = null
    try {
      const result = await fn(...args)
      if (toast) {
        useToast().add({ title: 'Operación exitosa', color: 'primary' })
      }
      for (const cb of callbacksExito) cb(result, 'success')
      return { data: result, error: null }
    } catch (err) {
      error.value = err
      if (toast) {
        useToast().add({ title: 'Error', description: err.message, color: 'error' })
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
    create: datos => ejecutar(repo.create, [datos]),
    read: id => ejecutar(repo.read, [id]),
    readAll: opts => ejecutar(repo.readAll, [opts ?? {}]),
    update: (id, cambios) => ejecutar(repo.update, [id, cambios]),
    patch: (id, cambios) => ejecutar(repo.patch, [id, cambios]),
    remove: id => ejecutar(repo.remove, [id])
  }
}
