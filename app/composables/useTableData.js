import { refDebounced } from '@vueuse/core'

/**
 * useTableData - Composable para gestión de datos de tabla: URL reactiva, paginación, fetch y normalización.
 *
 * @param {Object} props - Props del componente padre (BaseTable).
 * @param {string} props.apiUrl - URL base del endpoint API.
 * @param {number} [props.defaultLimit=20] - Límite por defecto de paginación.
 * @param {Object} [props.query={}] - Filtros adicionales reactivos para queries.
 * @param {boolean} [props.pagination=true] - Si usar paginación server-side.
 * @param {string} [props.dataKey] - Clave de datos en respuesta paginada (ej: 'data', 'items').
 * @param {Ref|ComputedRef} [props.search] - Término de búsqueda reactivo (debounced 500ms).
 *
 * @returns {Object} Estado y métodos para la tabla:
 * @returns {Ref<number>} returns.page - Página actual (1-indexed).
 * @returns {Ref<number>} returns.pageCount - Items por página (límite).
 * @returns {ComputedRef<string>} returns.fetchUrl - URL completa con query params construida reactivamente.
 * @returns {ComputedRef<Array>} returns.data - Datos normalizados (array de items para la página actual).
 * @returns {ComputedRef<number>} returns.total - Total de items (para paginación).
 * @returns {ComputedRef<boolean>} returns.pending - True mientras fetch está en curso.
 * @returns {Ref<Error|null>} returns.fetchError - Error del fetch si ocurrió.
 * @returns {Function} returns.refresh - Función para re-ejecutar el fetch.
 *
 * @example
 * const { page, pageCount, data, total, pending, fetchError, refresh } = useTableData(props)
 *
 * // En template:
 * // <div v-for="item in data">{{ item.nombre }}</div>
 * // <Pagination :page="page" :page-count="pageCount" :total="total" @update:page="page = $event" />
 * // <button @click="refresh" :disabled="pending">{{ pending ? 'Cargando...' : 'Actualizar' }}</button>
 */
export function useTableData(props) {
  // ─── Paginación ───────────────────────────────────────────────
  const page = ref(1)
  const pageCount = ref(props.defaultLimit)

  // ─── URL reactiva ─────────────────────────────────────────────
  const debouncedSearch = refDebounced(computed(() => props.search), 500)

  const fetchUrl = computed(() => {
    const params = new URLSearchParams()

    if (debouncedSearch.value) {
      params.append('search', debouncedSearch.value)
    }

    if (props.pagination) {
      params.append('page', String(page.value))
      params.append('limit', String(pageCount.value))
    }

    Object.entries(props.query).forEach(([key, value]) => {
      if (value != null && value !== '' && value !== 'all') {
        params.append(key, String(value))
      }
    })

    const qs = params.toString()
    return qs ? `${props.apiUrl}?${qs}` : props.apiUrl
  })

  // Resetear página al cambiar búsqueda o filtros externos
  watch(debouncedSearch, () => {
    page.value = 1
  })
  watch(() => props.query, () => {
    page.value = 1
  }, { deep: true })

  // ─── Fetching ─────────────────────────────────────────────────
  const { data: rawData, pending, error: fetchError, refresh } = useApiFetch(fetchUrl)

  // ─── Normalización de datos ───────────────────────────────────
  const data = computed(() => {
    if (!rawData.value) return []

    if (Array.isArray(rawData.value)) {
      if (props.pagination) {
        const start = (page.value - 1) * pageCount.value
        return rawData.value.slice(start, start + pageCount.value)
      }
      return rawData.value
    }

    if (rawData.value.data && Array.isArray(rawData.value.data)) {
      return rawData.value.data
    }

    if (props.dataKey && rawData.value[props.dataKey]) {
      return rawData.value[props.dataKey]
    }

    return Object.values(rawData.value).find(v => Array.isArray(v)) || []
  })

  const total = computed(() => {
    if (!rawData.value) return 0
    if (Array.isArray(rawData.value)) return rawData.value.length
    if (rawData.value?.total !== undefined) return rawData.value.total
    if (rawData.value?.count !== undefined) return rawData.value.count
    return data.value.length
  })

  return {
    page,
    pageCount,
    data,
    total,
    pending,
    fetchError,
    refresh
  }
}
