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
    <template #producto="{ row }">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ getProductoNombre(row.productoId) }}</span>
          <UBadge v-if="row.esExtra" label="Extra" color="amber" size="xs" />
          <UButton
            :icon="expandida.has(row.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            variant="ghost"
            size="xs"
            @click="toggleExpandir(row.id)"
          />
        </div>
        <div v-if="expandida.has(row.id)" class="mt-1">
          <UInput
            v-model="row.nota"
            placeholder="Nota libre (opcional)"
            size="sm"
            class="w-64"
            :disabled="readonly"
          />
        </div>
      </div>
    </template>

    <template #precioVentaUsado="{ row }">
      <UInputNumber
        v-model="row.precioVentaUsado"
        :min="0"
        :step="10"
        size="sm"
        class="w-28"
        :disabled="readonly"
        @update:model-value="recalcularSubtotal(row)"
      />
    </template>

    <template #cantidad="{ row }">
      <UInputNumber
        v-model="row.cantidad"
        :min="0"
        :step="0.5"
        size="sm"
        class="w-20"
        :disabled="readonly"
        @update:model-value="recalcularSubtotal(row)"
      />
    </template>

    <template #tipoLinea="{ row }">
      <USelectMenu
        v-model="row.tipoLinea"
        :items="[
          { label: 'Normal', value: 'normal' },
          { label: 'Regalo', value: 'regalo' },
          { label: 'Desc. familiar', value: 'descuento_familiar' }
        ]"
        size="sm"
        class="w-36"
        :disabled="readonly"
      />
    </template>

    <template #subtotal="{ row }">
      <span class="font-mono font-semibold">{{ fmtMoneda(row.subtotal) }}</span>
    </template>

    <template #extra>
      <div v-if="showAgregarProducto" class="flex items-center gap-2 p-2 border-t border-gray-200 dark:border-gray-800">
        <USelectMenu
          v-model="productoSeleccionado"
          :items="productosActivos.map(p => ({ label: p.nombre, value: p.id }))"
          placeholder="Seleccionar producto..."
          class="w-48"
        />
        <UButton icon="i-lucide-plus" size="sm" :disabled="readonly" @click="agregarLineaExtra">
          Agregar
        </UButton>
        <UButton variant="ghost" size="sm" :disabled="readonly" @click="showAgregarProducto = false">
          Cancelar
        </UButton>
      </div>
      <div v-else class="p-2 text-right">
        <UButton variant="ghost" size="sm" icon="i-lucide-plus" :disabled="readonly" @click="showAgregarProducto = true">
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
  showAgregarProducto, productoSeleccionado,
  recalcularSubtotal, agregarLineaExtra, toggleExpandir,
  fmtMoneda, getProductoNombre
} = useCuadre()

defineProps({
  readonly: { type: Boolean, default: false }
})

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
