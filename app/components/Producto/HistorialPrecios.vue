<template>
  <BaseDialog
    v-model="isOpen"
    :title="`Historial de precios - ${producto?.nombre}`"
    :loading="pending"
  >
    <div v-if="pending" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>
    <UTable
      v-else
      :data="historial ?? []"
      :columns="columns"
      empty="Sin historial"
    >
      <template #vigenteDesde-cell="{ row }">
        {{ fmtDate(row.original.vigenteDesde) }}
      </template>
      <template #vigenteHasta-cell="{ row }">
        {{ row.original.vigenteHasta ? fmtDate(row.original.vigenteHasta) : 'Vigente' }}
      </template>
      <template #precioCompra-cell="{ row }">
        {{ fmtPrecio(row.original.precioCompra) }}
      </template>
      <template #precioVenta-cell="{ row }">
        {{ fmtPrecio(row.original.precioVenta) }}
      </template>
    </UTable>
    <template #actions>
      <UButton variant="outline" @click="isOpen = false">
        Cerrar
      </UButton>
    </template>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  producto: { type: Object, default: null }
})

const isOpen = defineModel({ type: Boolean, default: false })
const productoRepo = useRepo('productos')

const historial = ref([])
const pending = ref(false)

watch(isOpen, async (open) => {
  if (open && props.producto?.id) {
    pending.value = true
    try {
      historial.value = await productoRepo.getHistorial(props.producto.id)
    } finally {
      pending.value = false
    }
  }
})

const columns = [
  { accessorKey: 'vigenteDesde', header: 'Desde' },
  { accessorKey: 'vigenteHasta', header: 'Hasta' },
  { accessorKey: 'precioCompra', header: 'Precio compra' },
  { accessorKey: 'precioVenta', header: 'Precio venta' }
]
</script>
