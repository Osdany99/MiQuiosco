<template>
  <div @scroll.capture="soltarFoco">
    <BaseTable
      :data="lineas"
      :columns="columnDefs"
      :show-edit="false"
      :show-delete="false"
      :loading-prop="cargando"
      :pagination="false"
      :disable-filters="true"
      @reload="reload"
    >
      <template #toolbar-leading>
        <UFileUpload
          v-model="importJsonFile"
          variant="button"
          accept=".json"
          size="sm"
        />
      </template>

      <template #producto-cell="{ row }">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ getProductoNombre(row.original.productoId) }}</span>
            <UButton
              :icon="expandida.has(row.original.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              variant="ghost"
              size="xs"
              @click="toggleExpandir(row.original.id)"
            />
          </div>
          <div v-if="expandida.has(row.original.id)" class="mt-1">
            <UInput
              v-model="row.original.nota"
              placeholder="Nota libre (opcional)"
              size="sm"
              class="w-64"
              :disabled="readonly"
            />
          </div>
        </div>
      </template>

      <template #precioVentaUsado-cell="{ row }">
        <BaseInputNumber
          v-model="row.original.precioVentaUsado"
          class="w-28"
          :disabled="readonly"
          :readonly="bloqueado(row.original.id)"
          :increment="false"
          :decrement="false"
          @focus="(e) => activarEdicion(row.original, e)"
          @blur="terminarEdicion"
          @update:model-value="recalcularSubtotal(row.original)"
        />
      </template>

      <template #cantidad-cell="{ row }">
        <BaseInputNumber
          v-model="row.original.cantidad"
          :step="1"
          class="w-20"
          :disabled="readonly"
          :readonly="bloqueado(row.original.id)"
          :increment="false"
          :decrement="false"
          @focus="(e) => activarEdicion(row.original, e)"
          @blur="terminarEdicion"
          @update:model-value="recalcularSubtotal(row.original)"
        />
      </template>
    </BaseTable>
  </div>
</template>

<script setup>
const emit = defineEmits(['reload'])

const {
  lineas, expandida, cargando,
  recalcularSubtotal, toggleExpandir,
  getProductoNombre, procesarImportacionJSON
} = useCuadre()

const importJsonFile = ref(null)
watch(importJsonFile, (file) => {
  if (!file) return
  procesarImportacionJSON(file)
  importJsonFile.value = null
})

defineProps({
  readonly: { type: Boolean, default: false }
})

// Edición por toque: en móvil los campos viven bloqueados para que el
// scroll nunca los altere; solo se desbloquea la fila tocada explícitamente.
// Al perder foco (o al desplazar) vuelve a bloquearse.
const editandoId = ref(null)
let reEnfocando = false

function bloqueado(id) {
  return editandoId.value !== id
}

function activarEdicion(linea, e) {
  if (editandoId.value === linea.id) return
  editandoId.value = linea.id
  // Reenfocar para que el teclado aparezca (el foco inicial cayó en readonly)
  const el = e?.target?.tagName === 'INPUT' ? e.target : null
  if (el) {
    reEnfocando = true
    el.blur()
    nextTick(() => {
      el.focus()
      reEnfocando = false
    })
  }
}

function terminarEdicion() {
  if (reEnfocando) return
  editandoId.value = null
}

function soltarFoco() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'precioVentaUsado', header: 'Precio venta', visible: false },
  { accessorKey: 'cantidad', header: 'Cant.' },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: 'currency' }
]

function reload() {
  emit('reload')
}
</script>
