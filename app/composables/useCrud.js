/**
 * useCrud - Composable para operaciones CRUD (create, read, update, delete) con manejo de loading, error y toast.
 *
 * @param {string} baseUrl - URL base del recurso (ej: '/api/usuarios').
 * @param {Object} [callbacks={}] - Callbacks opcionales.
 * @param {Function} [callbacks.onSuccess] - Callback ejecutado tras operación exitosa (recibe response).
 * @param {boolean} [showToast=true] - Si mostrar toast de éxito/error automáticamente.
 *
 * @returns {Object} Objeto con métodos CRUD y estado:
 * @returns {Ref<boolean>} returns.loading - True mientras hay una petición en curso.
 * @returns {Ref<Error|null>} returns.error - Error de la última operación.
 * @returns {Function} returns.create - Crea recurso: (body) => Promise<{data, error}>.
 * @returns {Function} returns.update - Actualiza recurso: (id, body) => Promise<{data, error}>.
 * @returns {Function} returns.remove - Elimina recurso: (id) => Promise<{data, error}>.
 * @returns {Function} returns.patch - Actualización parcial: (id, body) => Promise<{data, error}>.
 *
 * @example
 * const { create, update, remove, loading, error } = useCrud('/api/productos', {
 *   onSuccess: () => refreshTable()
 * }, true)
 *
 * // Crear
 * const { data, error } = await create({ nombre: 'Producto', precio: 100 })
 *
 * // Actualizar
 * await update('123', { precio: 150 })
 *
 * // Eliminar
 * await remove('123')
 *
 * // Actualización parcial
 * await patch('123', { precio: 150 })
 */
export const useCrud = (baseUrl, { onSuccess } = {}, showToast = true) => {
  const { getHeaders } = useHeaders()
  const loading = ref(false)
  const error = ref(null)
  const toast = useToast()

  async function ejecutar(method, url, body) {
    loading.value = true
    error.value = null
    try {
      const response = await $fetch(url, { method, headers: getHeaders(), body })
      if (showToast) toast.add({ title: 'Operación exitosa', color: 'primary' })
      await onSuccess?.()
      return { data: response, error: null }
    } catch (err) {
      error.value = err
      if (err?.response?.status === 401) await useAuth().logout()
      if (showToast) toast.add({ title: 'Error', description: err.statusMessage || err.message, color: 'error' })
      return { data: null, error: err }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    create: body => ejecutar('POST', baseUrl, body),
    update: (id, body) => ejecutar('PUT', `${baseUrl}/${id}`, body),
    remove: id => ejecutar('DELETE', `${baseUrl}/${id}`),
    patch: (id, body) => ejecutar('PATCH', `${baseUrl}/${id}`, body)
  }
}
