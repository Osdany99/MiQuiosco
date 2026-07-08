<template>
  <BaseTable
    :data="lineas"
    :columns="columnDefs"
    :show-edit="false"
    :show-delete="false"
    :loading-prop="cargando"
    :pagination="false"
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
          <UBadge
            v-if="row.original.esExtra"
            label="Extra"
            color="amber"
            size="xs"
          />
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
        @update:model-value="recalcularSubtotal(row.original)"
      />
    </template>

    <template #cantidad-cell="{ row }">
      <BaseInputNumber
        v-model="row.original.cantidad"
        :step="1"
        class="w-20"
        :disabled="readonly"
        @update:model-value="recalcularSubtotal(row.original)"
      />
    </template>

    <template #tipoLinea-cell="{ row }">
      <USelectMenu
        v-model="row.original.tipoLinea"
        :items="tipoVenta"
        size="sm"
        class="w-36"
        :disabled="readonly"
      />
    </template>

    <template #subtotal-cell="{ row }">
      <span class="font-mono font-semibold">{{ fmtPrecio(row.original.subtotal) }}</span>
    </template>

    <template #extra>
      <div v-if="showAgregarProducto" class="flex items-center gap-2 p-2 border-t border-gray-200 dark:border-gray-800">
        <USelectMenu
          v-model="productoSeleccionado"
          :items="productosActivos.map(p => ({ label: p.nombre, value: p.id }))"
          value-key="value"
          placeholder="Seleccionar producto..."
          class="w-48"
        />
        <USelectMenu
          v-model="tipoLineaExtra"
          :items="tipoVenta"
          value-key="value"
          size="sm"
          class="w-36"
        />
        <BaseButtonActions
          confirm-text="Agregar"
          confirm-icon="i-lucide-plus"
          size="sm"
          cancel-variant="ghost"
          :disabled-guardar="readonly"
          @confirm="agregarLineaExtra(tipoLineaExtra)"
          @cancel="showAgregarProducto = false"
        />
      </div>
      <div v-else class="p-2 text-right">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-plus"
          :disabled="readonly"
          @click="showAgregarProducto = true"
        >
          Agregar producto extra
        </UButton>
      </div>
    </template>
  </BaseTable>
</template>

<script setup>
const emit = defineEmits(['reload'])

const {
  lineas, productosActivos, expandida, cargando,
  showAgregarProducto, productoSeleccionado, tipoLineaExtra,
  recalcularSubtotal, agregarLineaExtra, toggleExpandir,
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

const tipoVenta = [
  { label: 'Normal', value: 'normal' },
  { label: 'Regalo', value: 'regalo' },
  { label: 'Deuda', value: 'deuda' },
  { label: 'Desc. familiar', value: 'descuento_familiar' }
]

const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'precioVentaUsado', header: 'Precio venta' },
  { accessorKey: 'cantidad', header: 'Cant.' },
  { accessorKey: 'tipoLinea', header: 'Tipo' },
  { accessorKey: 'subtotal', header: 'Subtotal' }
]

function reload() {
  emit('reload')
}
</script>
