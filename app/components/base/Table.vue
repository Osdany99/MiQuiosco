<template>
  <div>
    <UCard :ui="{ body: { padding: 'p-0' } }" class="relative">
      <!-- Selector de columnas -->
      <div
        class="flex justify-end items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800"
      >
        <USelectMenu
          v-model="visibleHeaders"
          :options="columnHeaders"
          :items="columnHeaders"
          multiple
          placeholder="Columnas visibles"
          class="w-48"
        >
          <template #label>
            <UIcon name="i-lucide-columns" class="w-4 h-4 mr-2 inline-block align-text-bottom" />
            Columnas ({{ visibleHeaders.length }})
          </template>
        </USelectMenu>
      </div>

      <!-- Loading Overlay -->
      <div
        v-if="pending || loadingProp"
        class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-10 flex items-center justify-center backdrop-blur-[1px]"
      >
        <UIcon name="i-lucide-loader-2" class="w-10 h-10 animate-spin text-primary" />
      </div>

      <!-- Error State -->
      <div
        v-if="fetchError"
        class="flex flex-col items-center justify-center h-32 gap-2 text-red-500"
      >
        <UIcon name="i-lucide-alert-circle" class="w-8 h-8" />
        <p class="text-sm">
          Error al cargar los datos.
          <button class="underline" @click="refresh">
            Reintentar
          </button>
        </p>
      </div>

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
            <div class="flex gap-2 justify-start">
              <UButton
                v-if="showEdit"
                icon="i-lucide-edit"
                size="sm"
                color="secondary"
                variant="ghost"
                @click="handleEdit(row.original || row)"
              />
              <UButton
                v-if="showDelete"
                icon="i-lucide-trash"
                size="sm"
                color="error"
                variant="ghost"
                @click="handleDelete(row.original || row)"
              />
            </div>
          </slot>
        </template>
      </UTable>

      <template v-if="pagination" #footer>
        <div class="flex justify-between items-center px-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ total }} resultado{{ total !== 1 ? 's' : '' }}
          </span>
          <UPagination v-model="page" :page-count="pageCount" :total="total" />
        </div>
      </template>
    </UCard>

    <!-- Modal Add/Edit -->
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

    <!-- Modal Eliminación -->
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

// ─── Composables ──────────────────────────────────────────────────────────────
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

// ─── Columnas visibles ────────────────────────────────────────────────────────
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

// ─── Expose ───────────────────────────────────────────────────────────────────
defineExpose({
  openAdd: () => {
    emit('reset') // Limpia el form en el padre ANTES de abrir
    isEditing.value = false
    isOpen.value = true
  },
  refresh,
  data
})

defineOptions({ inheritAttrs: false })
</script>
