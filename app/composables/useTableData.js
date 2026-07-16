import { refDebounced } from '@vueuse/core'

/**
 * useTableData - Gestión de datos de tabla con filtrado server-side.
 *
 * @param {Object} props
 * @param {Object} [props.config] — { tabla, endpoints }
 * @param {number} [props.defaultLimit=20]
 * @param {Object} [props.query={}]
 * @param {boolean} [props.pagination=true]
 * @param {Ref|ComputedRef} [props.search]
 * @param {Ref} filters
 */
export function useTableData(props, filters = ref({})) {
  if (!props.config) {
    return {
      page: ref(1),
      pageCount: ref(props.defaultLimit),
      data: ref([]),
      total: ref(0),
      pending: ref(false),
      fetchError: ref(null),
      refresh: () => {},
      filtered: ref([])
    }
  }
  const repo = useRepo(props.config)

  const page = ref(1)
  const pageCount = ref(props.defaultLimit)
  const debouncedSearch = refDebounced(computed(() => props.search), 500)

  const allData = ref([])
  const pending = ref(false)
  const fetchError = ref(null)

  async function fetchAll() {
    pending.value = true
    fetchError.value = null
    try {
      const query = { ...props.query, ...filters.value }
      const result = await repo.readAll({ query })
      allData.value = Array.isArray(result) ? result : (result?.data ?? [])
    } catch (err) {
      fetchError.value = err
      allData.value = []
    } finally {
      pending.value = false
    }
  }

  const filtered = computed(() => {
    let items = allData.value

    if (debouncedSearch.value) {
      const q = debouncedSearch.value.toLowerCase()
      const fields = props.searchFields?.length ? props.searchFields : null
      items = items.filter((item) => {
        const values = fields
          ? fields.map(f => String(item[f] ?? ''))
          : Object.values(item).map(v => String(v))
        return values.some(v => v.toLowerCase().includes(q))
      })
    }

    return items
  })

  const data = computed(() => {
    if (!props.pagination) return filtered.value
    const start = (page.value - 1) * pageCount.value
    return filtered.value.slice(start, start + pageCount.value)
  })

  const total = computed(() => filtered.value.length)

  watch(debouncedSearch, () => {
    page.value = 1
  })

  watch(filters, () => {
    page.value = 1
    fetchAll()
  }, { deep: true })

  watch(() => props.query, () => {
    page.value = 1
    fetchAll()
  }, { deep: true })

  if (import.meta.client) fetchAll()

  return { page, pageCount, data, total, pending, fetchError, refresh: fetchAll, filtered }
}
