import { refDebounced } from '@vueuse/core'

/**
 * useTableData
 * Gestiona la URL de fetch, la paginación y la normalización de datos.
 *
 * @param {Object} props - Props del componente BaseTable
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
