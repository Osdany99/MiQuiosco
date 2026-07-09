import { refDebounced } from '@vueuse/core'
import { ENTIDADES } from '~/config/entidades'

/**
 * useTableData - Gestión de datos de tabla.
 *
 * Resuelve la fuente según el modo de conexión:
 * - 'local'  → useLocalRepo (SQLite, búsqueda/filtros/paginación cliente)
 * - 'online' → useRemoteRepo (REST API, búsqueda/filtros/paginación cliente)
 *
 * @param {Object} props
 * @param {string} props.entidad — Nombre de la entidad (ej: 'productos')
 * @param {number} [props.defaultLimit=20]
 * @param {Object} [props.query={}] — filtros { campo: valor }
 * @param {boolean} [props.pagination=true]
 * @param {Ref|ComputedRef} [props.search] — búsqueda reactiva (debounced 500ms)
 */
export function useTableData(props) {
  if (!props.entidad || !ENTIDADES[props.entidad]) {
    return {
      page: ref(1),
      pageCount: ref(props.defaultLimit),
      data: ref([]),
      total: ref(0),
      pending: ref(false),
      fetchError: ref(null),
      refresh: () => {}
    }
  }
  const repo = useRepo(props.entidad)

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
      allData.value = await repo.readAll()
    } catch (err) {
      fetchError.value = err
      allData.value = []
    } finally {
      pending.value = false
    }
  }

  // Filtrado + búsqueda
  const filtered = computed(() => {
    let items = allData.value

    if (props.query) {
      Object.entries(props.query).forEach(([key, value]) => {
        if (value != null && value !== '' && value !== 'all') {
          items = items.filter(item => item[key] === value)
        }
      })
    }

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

  // Paginación cliente
  const data = computed(() => {
    if (!props.pagination) return filtered.value
    const start = (page.value - 1) * pageCount.value
    return filtered.value.slice(start, start + pageCount.value)
  })

  const total = computed(() => filtered.value.length)

  watch(debouncedSearch, () => {
    page.value = 1
  })
  watch(() => props.query, () => {
    page.value = 1
  }, { deep: true })

  if (import.meta.client) fetchAll()

  return { page, pageCount, data, total, pending, fetchError, refresh: fetchAll, filtered }
}
