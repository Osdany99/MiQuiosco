<template>
  <BaseDialog
    v-model="isOpen"
    title="Reponer para mañana"
    description="Calculado con lo vendido hoy y el recomendado de cada producto."
    confirm-text="Generar traspaso"
    :loading="guardando"
    :disabled-guardar="seleccion.length === 0"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <UTable
      v-model:row-selection="seleccionRows"
      :data="sugerencias"
      :columns="columns"
      empty="Nada que reponer"
    >
      <template #select-header>
        <UCheckbox :model-value="todasMarcadas" @update:model-value="marcarTodas" />
      </template>
      <template #select-cell="{ row }">
        <UCheckbox :model-value="estaMarcada(row.original)" @update:model-value="alternar(row.original)" />
      </template>
    </UTable>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  sugerencias: { type: Array, default: () => [] }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['generado'])

const inv = useInventario()
const toast = useToast()
const guardando = ref(false)
const seleccion = ref([])

const columns = [
  { id: 'select', header: '' },
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'quiosco', header: 'Quiosco' },
  { accessorKey: 'recomendado', header: 'Recomendado' },
  { accessorKey: 'aReponer', header: 'A reponer' },
  { accessorKey: 'disponibleAlmacen', header: 'En almacén' }
]

const seleccionRows = computed({
  get: () => Object.fromEntries(seleccion.value.map(s => [s.productoId, true])),
  set: () => {}
})

const todasMarcadas = computed(() =>
  props.sugerencias.length > 0 && seleccion.value.length === props.sugerencias.length
)

function estaMarcada(row) {
  return seleccion.value.some(s => s.productoId === row.productoId)
}

function alternar(row) {
  if (estaMarcada(row)) {
    seleccion.value = seleccion.value.filter(s => s.productoId !== row.productoId)
  } else {
    seleccion.value = [...seleccion.value, row]
  }
}

function marcarTodas(v) {
  seleccion.value = v ? [...props.sugerencias] : []
}

watch(isOpen, (open) => {
  if (open) seleccion.value = [...props.sugerencias]
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarTraspaso({
      fecha: hoyLocal(),
      notas: 'Reposición post-cierre',
      lineas: seleccion.value.map(s => ({ productoId: s.productoId, cantidad: s.aReponer }))
    })
    toast.add({ title: 'Quiosco repuesto', color: 'success' })
    isOpen.value = false
    emit('generado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
