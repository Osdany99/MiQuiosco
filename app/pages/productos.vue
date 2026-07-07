<script setup>
definePageMeta({
  middleware: ['jefe']
})

const tableRef = ref(null)
const productoFormRef = ref(null)

const form = ref({
  id: null,
  nombre: '',
  descripcion: '',
  precioCompraActual: 0,
  precioVentaActual: 0,
  orden: 0,
  activo: true
})

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'orden', header: 'Orden' },
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'descripcion', header: 'Descripción' },
  { accessorKey: 'precioCompraActual', header: 'Precio Compra' },
  { accessorKey: 'precioVentaActual', header: 'Precio Venta' },
  { accessorKey: 'activo', header: 'Estado' },
  { accessorKey: 'action', header: 'Acciones' }
]

const showHistorial = ref(false)
const historialProducto = ref(null)

const { patch, loading: reorderLoading } = useCrud(API.productos.list, {}, false)

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
    title="Productos"
    description="Catálogo de productos del puesto"
    title-button="Nuevo Producto"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :api-url="API.productos.list"
      :columns="columns"
      empty-state="No se encontraron productos"
      modal-title="Producto"
      :form-ref="productoFormRef"
      :submit-fields="['nombre', 'descripcion', 'precioCompraActual', 'precioVentaActual', 'orden', 'activo']"
      :pagination="false"
    >
      <template #form>
        <ProductoForm ref="productoFormRef" v-model="form" />
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

      <template #precioCompraActual-cell="{ row }">
        {{ fmtPrecio(row.original.precioCompraActual) }}
      </template>

      <template #precioVentaActual-cell="{ row }">
        {{ fmtPrecio(row.original.precioVentaActual) }}
      </template>

      <template #activo-cell="{ row }">
        <BaseChangeActivation
          :id="row.original.id"
          :default-value="row.original.activo"
          :api-url="API.productos.list"
          :table-ref="tableRef"
        />
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
