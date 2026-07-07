<template>
  <div>
    <UCard :ui="{ body: { padding: 'p-0' } }" class="relative">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <TableReload @reload="reload" />
        <TableToolbar v-model:visible-headers="visibleHeaders" :column-headers="columnHeaders" />
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

const data = computed(() => {
  if (isExternalData.value) {
    if (!props.pagination) return props.data
    const start = (internalPage.value - 1) * internalPageCount.value
    return (props.data || []).slice(start, start + internalPageCount.value)
  }
  return repoTable?.data.value ?? []
})

const total = computed(() => {
  if (isExternalData.value) return props.data?.length ?? 0
  return repoTable?.total.value ?? 0
})

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
  data
})

defineOptions({ inheritAttrs: false })
</script>
