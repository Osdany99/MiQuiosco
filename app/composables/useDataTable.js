/**
 * useDataTable - Composable para manejar lógica de tablas (fetching, búsqueda, filtrado)
 * @param {string} url - El endpoint de la API
 * @param {Object} options - Opciones de configuración
 * @param {Ref|computed} options.query - Query params reactivos
 * @param {string} options.dataKey - La propiedad de la respuesta que contiene los datos (ej: 'users')
 * @param {Array<string>} options.searchFields - Campos por los que buscar localmente
 */
export const useDataTable = (url, options = {}) => {
  const { query = null, dataKey = '', searchFields = [] } = options

  const search = ref('')

  // Fetching de datos
  const {
    data: rawData,
    status,
    refresh,
    error
  } = useFetch(url, {
    query: query || undefined,
    watch: query ? [query] : []
  })

  // Extraer los items según la dataKey
  const items = computed(() => {
    if (!rawData.value) return []
    if (!dataKey) return rawData.value
    return rawData.value[dataKey] || []
  })

  // Búsqueda local (client-side)
  const filteredItems = computed(() => {
    if (!items.value) return []
    if (!search.value || searchFields.length === 0) return items.value

    const searchLower = search.value.toLowerCase()

    return items.value.filter((item) => {
      return searchFields.some((field) => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], item)
        return String(value || '')
          .toLowerCase()
          .includes(searchLower)
      })
    })
  })

  const loading = computed(() => status.value === 'pending')

  return {
    items,
    filteredItems,
    search,
    loading,
    refresh,
    error,
    status
  }
}
