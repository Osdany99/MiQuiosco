<script setup>
import { productoSchema } from '~~/shared/schemas/producto'
import { productos as config } from '~/config/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre del producto', colSpan: 'sm:col-span-2', props: { class: 'w-full', maxlength: 100 } },
  { name: 'descripcion', label: 'Descripción', type: 'text', required: false, placeholder: 'Descripción opcional', colSpan: 'sm:col-span-2', props: { class: 'w-full' } },
  { name: 'precioCompraActual', label: 'Precio compra', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'precioVentaActual', label: 'Precio venta', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'orden', label: 'Orden', type: 'number', required: false, colSpan: 'sm:col-span-2', props: { class: 'w-full', min: 1, step: 1 } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, colSpan: 'sm:col-span-2', props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'orden', header: 'Orden' },
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

const { patch, loading: reorderLoading } = useRepo(config)

function esPrimero(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  return rows.findIndex(x => x.id === p.id) === 0
}

function esUltimo(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  return idx === -1 || idx === rows.length - 1
}

async function moverArriba(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  if (idx <= 0) return

  const actual = rows[idx]
  const anterior = rows[idx - 1]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    patch(actual.id, { orden: anterior.orden }),
    patch(anterior.id, { orden: actual.orden })
  ])

  if (!error1 && !error2) {
    await tableRef.value?.refresh()
  }
}

async function moverAbajo(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  if (idx === -1 || idx >= rows.length - 1) return

  const actual = rows[idx]
  const siguiente = rows[idx + 1]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    patch(actual.id, { orden: siguiente.orden }),
    patch(siguiente.id, { orden: actual.orden })
  ])

  if (!error1 && !error2) {
    await tableRef.value?.refresh()
  }
}
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Catálogo de productos del puesto"
    :title-button="'Nuevo ' + config.label.singular"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="config"
      :columns="columns"
      :form-ref="formRef"
      :pagination="false"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="productoSchema"
        />
      </template>

      <template #orden-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-up"
            variant="ghost"
            size="xs"
            :disabled="reorderLoading || esPrimero(row.original)"
            @click="moverArriba(row.original)"
          />
          <span class="font-mono">{{ row.original.orden }}</span>
          <UButton
            icon="i-lucide-chevron-down"
            variant="ghost"
            size="xs"
            :disabled="reorderLoading || esUltimo(row.original)"
            @click="moverAbajo(row.original)"
          />
        </div>
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
