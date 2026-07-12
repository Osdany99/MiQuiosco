/**
 * useRepoAction(tabla, opts) — Wrapper sobre useRepo con loading/error/toast/onSuccess.
 *
 * Capa opcional para componentes/páginas que quieren el comportamiento
 * "tipo useCrud": un solo loading compartido, toast automático, callback de éxito.
 *
 * Para consumidores que ya gestionan su propio estado (useCuadre, useCuentasFiado,
 * o cualquier composable de dominio), usar `useRepo(tabla)` directo en su lugar.
 *
 * @param {string} tabla
 * @param {Object} [opts]
 * @param {boolean} [opts.toast=true] — mostrar toast de éxito/error
 * @returns {Object} { loading, error, onSuccess, create, read, readAll, update, patch, remove }
 */
export function useRepoAction(tabla, { toast = true } = {}) {
  const repo = useRepo(tabla)
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
