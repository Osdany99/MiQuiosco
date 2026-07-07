/**
 * useCrud — Operaciones CRUD.
 *
 * Resuelve el repositorio según el modo de conexión:
 * - 'local'  → useLocalRepo(tabla)
 * - 'online' → useRemoteRepo(tabla)
 *
 * @param {string} baseUrl — URL base del recurso (ej: '/api/productos').
 * @param {Object} [callbacks={}] — { onSuccess }
 * @param {boolean} [showToast=true] — mostrar toast de éxito/error
 */
export const useCrud = (baseUrl, { onSuccess } = {}, showToast = true) => {
  if (!baseUrl) {
    return {
      loading: ref(false),
      error: ref(null),
      create: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
      patch: () => Promise.resolve({ data: null, error: null })
    }
  }
  const tabla = baseUrl.split('/').filter(Boolean).pop() || 'unknown'
  const repo = useRepo(tabla)
  const loading = ref(false)
  const error = ref(null)
  const toast = useToast()

  async function ejecutar(method, body, id) {
    loading.value = true
    error.value = null
    try {
      const r = repo
      let response
      if (method === 'POST') {
        response = await r.create(body)
      } else if (method === 'PUT' || method === 'PATCH') {
        await r.update(id, body)
        response = { id, ...body }
      } else if (method === 'DELETE') {
        await r.remove(id)
        response = { success: true }
      }
      if (showToast) toast.add({ title: 'Operación exitosa', color: 'primary' })
      await onSuccess?.()
      return { data: response, error: null }
    } catch (err) {
      error.value = err
      if (showToast) toast.add({ title: 'Error', description: err.message, color: 'error' })
      return { data: null, error: err }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    create: body => ejecutar('POST', body),
    update: (id, body) => ejecutar('PUT', body, id),
    remove: id => ejecutar('DELETE', null, id),
    patch: (id, body) => ejecutar('PATCH', body, id)
  }
}
