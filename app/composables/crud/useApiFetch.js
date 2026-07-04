import { useAuthHeaders } from '/composables/useAuthHeaders'

export function useApiFetch(url, options = {}) {
  const { getHeaders } = useAuthHeaders()

  const apiFetch = $fetch.create({
    onRequest({ options }) {
      options.headers = { ...options.headers, ...getHeaders() }
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        const auth = useAuth()
        auth.logout()
      }
    }
  })

  return useFetch(url, { ...options, $fetch: apiFetch })
}
