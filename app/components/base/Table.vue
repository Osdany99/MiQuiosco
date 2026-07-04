<template>
  <div>
    <UCard :ui="{ body: { padding: 'p-0' } }" class="relative">
      <TableToolbar v-model:visible-headers="visibleHeaders" :column-headers="columnHeaders" />

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
            />
          </slot>
        </template>
      </UTable>

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
  apiUrl: { type: String, required: true },
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
  loadingProp: { type: Boolean, default: false }
})

const emit = defineEmits(['edit', 'delete', 'success', 'reset'])
const form = defineModel({ type: Object })

const { page, pageCount, data, total, pending, fetchError, refresh } = useTableData(props)

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
const visibleHeaders = ref(props.columns.map(c => c.header))

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
  if ((props.showEdit || props.showDelete) && !hasActionsColumn.value) {
    return [...filteredColumns.value, { id: 'action', header: 'Acciones' }]
  }
  return filteredColumns.value
})

defineExpose({
  openAdd: () => {
    emit('reset')
    isEditing.value = false
    isOpen.value = true
  },
  refresh,
  data
})

defineOptions({ inheritAttrs: false })
</script>
