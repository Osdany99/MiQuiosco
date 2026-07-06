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
const toast = useToast()

const historialUrl = computed(() =>
  isOpen.value && props.producto?.id
    ? API.productos.historialPrecios(props.producto.id)
    : null
)

const { data: historial, pending, error, refresh } = useApiFetch(historialUrl, {
  immediate: false
})

watch(isOpen, (open) => {
  if (open && props.producto?.id) {
    nextTick(() => refresh())
  }
})

watch(error, (err) => {
  if (err) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || err.statusMessage || err.message,
      color: 'error'
    })
  }
})

const columns = [
  { accessorKey: 'vigenteDesde', header: 'Desde' },
  { accessorKey: 'vigenteHasta', header: 'Hasta' },
  { accessorKey: 'precioCompra', header: 'Precio compra' },
  { accessorKey: 'precioVenta', header: 'Precio venta' }
]
</script>
