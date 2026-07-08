<template>
  <div>
    <UCard :ui="{ body: { padding: 'p-0' } }" class="relative">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <TableToolbarLeft @reload="reload">
          <slot name="toolbar-leading" />
        </TableToolbarLeft>
        <div class="flex items-center gap-2">
          <UButton
            v-if="filterFields.length"
            variant="ghost"
            size="sm"
            icon="i-lucide-filter"
            :badge="activeFiltersCount || undefined"
            @click="showFilters = !showFilters"
          />
          <TableToolbar v-model:visible-headers="visibleHeaders" :column-headers="columnHeaders" />
        </div>
      </div>

      <div v-if="showFilters && filterFields.length" class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <div class="flex flex-wrap gap-3">
          <div v-for="field in filterFields" :key="field.key" class="flex items-center gap-2">
            <label class="text-xs text-gray-500 whitespace-nowrap">{{ field.label }}</label>
            <USelectMenu
              v-if="field.type === 'select'"
              v-model="filters[field.key]"
              :items="field.options"
              value-attribute="value"
              text-attribute="label"
              class="w-40"
              clearable
            />
            <UInput
              v-else
              v-model="filters[field.key]"
              :placeholder="field.label"
              class="w-40"
              clearable
            />
          </div>
          <UButton v-if="activeFiltersCount" size="xs" variant="ghost" color="neutral" label="Limpiar" @click="limpiarFiltros" />
        </div>
      </div>

      <TableLoading :loading="pending || loadingProp" />

      <TableError v-if="fetchError" :error="fetchError" @retry="refresh" />

      <UTable
        v-else
        :data="data"
        :columns="tableColumns"
        :loading="pending || loadingProp"
        :empty="emptyState"
        v-bind="$attrs"
      >
        <template v-for="(_, slotName) in $slots" #[slotName]="slotData">
          <slot v-if="slotName !== 'form'" :name="slotName" v-bind="slotData" />
        </template>

        <template #loading-state>
          <div class="flex items-center justify-center h-32">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
          </div>
        </template>

        <template #action-cell="{ row }">
          <slot name="actions" :row="row">
            <TableActions
              :show-edit="showEdit"
              :show-delete="showDelete"
              :row-data="row.original || row"
              @edit="handleEdit"
              @delete="handleDelete"
            >
              <template #extra="slotProps">
                <slot name="row-actions-extra" v-bind="slotProps" />
              </template>
            </TableActions>
          </slot>
        </template>
      </UTable>

      <slot name="extra" />

      <template #footer>
        <TablePagination
          v-model="page"
          :pagination="pagination"
          :page-count="pageCount"
          :total="total"
        />
      </template>
    </UCard>

    <BaseDialog
      v-model="isOpen"
      :title="isEditing ? `Editar ${modalTitle}` : `Agregar ${modalTitle}`"
      :confirm-text="isEditing ? 'Guardar Cambios' : `Crear ${modalTitle}`"
      :loading="loading"
      @confirm="handleSubmit"
      @cancel="handleCloseModal"
    >
      <slot name="form" />
    </BaseDialog>

    <BaseDialog
      v-model="isDeleteOpen"
      title="Confirmar Eliminación"
      :loading="deleteLoading"
      @confirm="confirmDelete"
      @cancel="isDeleteOpen = false"
    >
      <p class="text-gray-600 dark:text-gray-300">
        ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
      </p>
    </BaseDialog>
  </div>
</template>

<script setup>
const props = defineProps({
  apiUrl: { type: String, default: '' },
  data: { type: Array, default: null },
  dataKey: { type: String, default: '' },
  columns: { type: Array, required: true },
  emptyState: { type: String, default: 'No se encontraron resultados' },
  showEdit: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: true },
  modalTitle: { type: String, default: 'Registro' },
  search: { type: String, default: '' },
  searchFields: { type: Array, default: () => [] },
  query: { type: Object, default: () => ({}) },
  filterFields: { type: Array, default: () => [] },
  pagination: { type: Boolean, default: true },
  defaultLimit: { type: Number, default: 10 },
  formRef: { type: Object, default: null },
  submitFields: { type: Array, default: null },
  loadingProp: { type: Boolean, default: false }
})

const emit = defineEmits(['edit', 'delete', 'success', 'reload'])
const form = defineModel({ type: Object })

const initialForm = ref(null)

onMounted(() => {
  if (form.value != null) {
    initialForm.value = JSON.parse(JSON.stringify(form.value))
  }
})

const showFilters = ref(false)

const filters = reactive(
  Object.fromEntries(props.filterFields.map(f => [f.key, '']))
)

const activeFilters = computed(() =>
  Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v != null && v !== '')
  )
)

const activeFiltersCount = computed(() => Object.keys(activeFilters.value).length)

function limpiarFiltros() {
  Object.keys(filters).forEach(k => { filters[k] = '' })
  page.value = 1
}

watch(activeFilters, () => { page.value = 1 }, { deep: true })

const isExternalData = computed(() => props.data !== null)

const internalPage = ref(1)
const internalPageCount = ref(props.defaultLimit)

const repoTable = !isExternalData.value ? useTableData(props) : null

const page = computed({
  get: () => (repoTable ? repoTable.page.value : internalPage.value),
  set: (v) => {
    if (repoTable) repoTable.page.value = v
    internalPage.value = v
  }
})

const pageCount = computed({
  get: () => (repoTable ? repoTable.pageCount.value : internalPageCount.value),
  set: (v) => {
    if (repoTable) repoTable.pageCount.value = v
    internalPageCount.value = v
  }
})

function aplicarFiltros(items) {
  const af = activeFilters.value
  if (!Object.keys(af).length) return items
  return items.filter(item =>
    Object.entries(af).every(([key, value]) =>
      String(item[key] ?? '').toLowerCase().includes(String(value).toLowerCase())
    )
  )
}

const filteredAll = computed(() => {
  let items
  if (isExternalData.value) {
    items = props.data || []
  } else {
    items = repoTable?.filtered.value ?? []
  }
  return aplicarFiltros(items)
})

const data = computed(() => {
  if (!props.pagination) return filteredAll.value
  const start = (page.value - 1) * pageCount.value
  return filteredAll.value.slice(start, start + pageCount.value)
})

const total = computed(() => filteredAll.value.length)

const pending = computed(() => {
  if (isExternalData.value) return props.loadingProp
  return repoTable?.pending.value ?? false
})

const fetchError = computed(() => {
  if (isExternalData.value) return null
  return repoTable?.fetchError.value ?? null
})

function refresh() {
  if (repoTable) repoTable.refresh()
}

const {
  isOpen,
  isEditing,
  isDeleteOpen,
  loading,
  deleteLoading,
  handleEdit,
  handleDelete,
  handleCloseModal,
  confirmDelete,
  handleSubmit
} = useTableCrud(props, emit, form, refresh)

const columnHeaders = computed(() => props.columns.map(c => c.header))
const visibleHeaders = ref(
  props.columns.filter(c => c.visible !== false).map(c => c.header)
)

function reload() {
  visibleHeaders.value = props.columns.filter(c => c.visible !== false).map(c => c.header)
  internalPage.value = 1
  if (repoTable) repoTable.page.value = 1
  refresh()
  emit('reload')
}

watch(columnHeaders, (newHeaders, oldHeaders) => {
  const added = newHeaders.filter(h => !oldHeaders.includes(h))
  if (added.length) visibleHeaders.value = [...visibleHeaders.value, ...added]
})

const filteredColumns = computed(() =>
  props.columns.filter(c => visibleHeaders.value.includes(c.header))
)

const hasActionsColumn = computed(() =>
  filteredColumns.value.some(c => ['action'].includes(c.accessorKey ?? c.key ?? c.id))
)

const tableColumns = computed(() => {
  if ((props.showEdit || props.showDelete) && visibleHeaders.value.includes('Acciones') && !hasActionsColumn.value) {
    return [...filteredColumns.value, { id: 'action', header: 'Acciones' }]
  }
  return filteredColumns.value
})

defineExpose({
  openAdd: () => {
    if (initialForm.value) {
      form.value = JSON.parse(JSON.stringify(initialForm.value))
    }
    isEditing.value = false
    isOpen.value = true
  },
  refresh,
  data,
  filters,
  showFilters,
  limpiarFiltros
})

defineOptions({ inheritAttrs: false })
</script>
