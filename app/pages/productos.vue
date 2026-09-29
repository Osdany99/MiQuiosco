<script setup>
import Sortable from 'sortablejs'
import { productoSchema } from '../../shared/schemas/producto'
import { productos as config } from '../../shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre del producto', colSpan: 'sm:col-span-2', props: { class: 'w-full', maxlength: 100 } },
  { name: 'descripcion', label: 'Descripción', type: 'text', required: false, placeholder: 'Descripción opcional', colSpan: 'sm:col-span-2', props: { class: 'w-full' } },
  { name: 'precioCompraActual', label: 'Precio compra', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'precioVentaActual', label: 'Precio venta', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, colSpan: 'sm:col-span-2', props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { id: 'drag', header: '' },
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'descripcion', header: 'Descripción' },
  { accessorKey: 'precioCompraActual', header: 'Precio Compra', cell: 'currency' },
  { accessorKey: 'precioVentaActual', header: 'Precio Venta', cell: 'currency' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]

const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', descripcion: '', precioCompraActual: 0, precioVentaActual: 0, orden: 0, activo: true })

const showHistorial = ref(false)
const historialProducto = ref(null)

const { patch } = useRepo(config)
const reordenando = ref(false)
let sortable = null

function filas() {
  return toValue(tableRef.value?.data) ?? []
}

function maxOrden() {
  return filas().reduce((m, r) => Math.max(m, Number(r.orden ?? 0)), 0)
}

// Al crear, el producto va al final (el orden visible ya no se edita a mano)
function nuevoProducto() {
  tableRef.value?.openAdd()
  form.value.orden = maxOrden() + 1
}

function initSortable() {
  destruirSortable()
  const tbody = tableRef.value?.$el?.querySelector('tbody')
  if (!tbody) return
  sortable = new Sortable(tbody, {
    handle: '.drag-handle',
    animation: 150,
    // En táctil exige pulsación larga: el scroll vertical sigue funcionando
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    scrollSensitivity: 60,
    onEnd: reordenar
  })
}

function destruirSortable() {
  sortable?.destroy()
  sortable = null
}

async function reordenar() {
  const tbody = tableRef.value?.$el?.querySelector('tbody')
  if (!tbody || reordenando.value) return
  const ids = [...tbody.querySelectorAll('tr .drag-handle')]
    .map(el => el.dataset.id)
    .filter(Boolean)
  if (!ids.length) return
  const porId = new Map(filas().map(r => [String(r.id), r]))
  reordenando.value = true
  try {
    // useRepo.patch devuelve { data, error }: hay que inspeccionar cada
    // resultado porque Promise.all no rechaza (los errores van en error).
    const resultados = await Promise.all(ids.map((id, i) => {
      const row = porId.get(id)
      const nuevo = i + 1
      if (!row || Number(row.orden) === nuevo) return null
      return patch(row.id, { orden: nuevo })
    }))
    const fallos = resultados.filter(r => r && r.error).length
    if (fallos > 0) {
      useToast().add({
        title: 'No se pudo guardar el orden',
        description: `Fallaron ${fallos} producto(s). Reintenta el arrastre.`,
        color: 'error'
      })
    }
  } finally {
    reordenando.value = false
    await tableRef.value?.refresh()
    initSortable()
  }
}

onMounted(() => {
  nextTick(() => initSortable())
  // Reintento por si la tabla aún no pintó el tbody
  setTimeout(() => {
    if (!sortable) initSortable()
  }, 1500)
})

onBeforeUnmount(() => destruirSortable())
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Catálogo de productos del puesto"
    :title-button="'Nuevo ' + config.label.singular"
    @new="nuevoProducto"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="config"
      :columns="columns"
      :form-ref="formRef"
      :pagination="false"
      :query="{ orderBy: 'orden', orderDir: 'asc' }"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="productoSchema"
        />
      </template>

      <template #drag-cell="{ row }">
        <span
          class="drag-handle inline-flex cursor-grab active:cursor-grabbing text-gray-400 touch-none select-none px-1"
          :data-id="row.original.id"
          title="Arrastrar para reordenar"
        >
          <UIcon name="i-lucide-grip-vertical" class="w-5 h-5" />
        </span>
      </template>

      <template #row-actions-extra="{ rowData }">
        <UTooltip text="Ver historial de precios" :delay-duration="0">
          <UButton
            icon="i-lucide-clock"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="historialProducto = rowData; showHistorial = true"
          />
        </UTooltip>
      </template>
    </BaseTable>
    <ProductoHistorialPrecios v-model="showHistorial" :producto="historialProducto" />
  </BaseHeaderPage>
</template>
