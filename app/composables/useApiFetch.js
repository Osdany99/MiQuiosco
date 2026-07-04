export function useApiFetch(url, options = {}) {
  const { getHeaders } = useHeaders()

  return useFetch(url, {
    ...options,
    server: false,
    headers: { ...getHeaders(), ...options.headers }
  })
}
