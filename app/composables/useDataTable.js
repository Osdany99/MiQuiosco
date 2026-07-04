/**
 * useDataTable - Composable para manejo de tablas con fetching, búsqueda y filtrado client-side.
 *
 * @param {string} url - Endpoint de la API para obtener datos.
 * @param {Object} [options={}] - Opciones de configuración.
 * @param {Ref|ComputedRef} [options.query=null] - Query params reactivos para el fetch (se observan cambios).
 * @param {string} [options.dataKey=''] - Clave de la respuesta que contiene el array de datos (ej: 'usuarios').
 * @param {string[]} [options.searchFields=[]] - Campos por los que filtrar localmente (soporta notación punto: 'usuario.nombre').
 *
 * @returns {Object} Estado reactivo y métodos para la tabla:
 * @returns {ComputedRef<Array>} returns.items - Datos crudos del fetch (sin filtrar).
 * @returns {ComputedRef<Array>} returns.filteredItems - Datos filtrados por búsqueda local.
 * @returns {Ref<string>} returns.search - Modelo reactivo para input de búsqueda.
 * @returns {ComputedRef<boolean>} returns.loading - True mientras el fetch está pendiente.
 * @returns {Function} returns.refresh - Función para re-ejecutar el fetch manualmente.
 * @returns {Ref<Error|null>} returns.error - Error del fetch si ocurrió.
 * @returns {ComputedRef<string>} returns.status - Estado del fetch: 'idle' | 'pending' | 'success' | 'error'.
 *
 * @example
 * const { items, filteredItems, search, loading, refresh, error } = useDataTable('/api/usuarios', {
 *   query: computed(() => ({ page: 1, limit: 20, rol: 'trabajador' })),
 *   dataKey: 'usuarios',
 *   searchFields: ['nombre', 'email', 'puesto.nombre']
 * })
 *
 * // En template:
 * // <input v-model="search" placeholder="Buscar...">
 * // <div v-for="item in filteredItems">{{ item.nombre }}</div>
 * // <button @click="refresh" :disabled="loading">{{ loading ? 'Cargando...' : 'Actualizar' }}</button>
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
