import { useAuthHeaders } from '/composables/useAuthHeaders'

export const useApi = (baseUrl, { onSuccess } = {}, showToast = true) => {
  const { getHeaders } = useAuthHeaders()
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
    patch: body => ejecutar('PATCH', baseUrl, body)
  }
}
