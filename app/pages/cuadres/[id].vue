<script setup>
definePageMeta({
  middleware: ['jefe']
})

const route = useRoute()
const id = computed(() => route.params.id)

const cuadre = ref(null)
const items = ref([])
const productos = ref([])
const cargando = ref(true)
const error = ref(null)

const repoCuadres = useRepo('cuadres')
const repoItems = useRepo('cuadre_items')
const repoProductos = useRepo('productos')

async function cargarDatos() {
  cargando.value = true
  error.value = null
  try {
    const [c, allItems, prods] = await Promise.all([
      repoCuadres.read(id.value),
      repoItems.readAll(),
      repoProductos.readAll()
    ])
    cuadre.value = c
    items.value = allItems.filter(i => i.cuadreId === id.value)
    productos.value = prods
  } catch (err) {
    error.value = err.message || 'Error al cargar el cuadre'
  } finally {
    cargando.value = false
  }
}

function getProductoNombre(productoId) {
  return productos.value.find(p => p.id === productoId)?.nombre || '—'
}

const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'precioVentaUsado', header: 'Precio venta' },
  { accessorKey: 'cantidad', header: 'Cant.' },
  { accessorKey: 'tipoLinea', header: 'Tipo' },
  { accessorKey: 'subtotal', header: 'Subtotal' }
]

onMounted(cargarDatos)
</script>

<template>
  <div v-if="cargando" class="flex items-center justify-center p-8">
    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
  </div>

  <div v-else-if="error" class="flex items-center justify-center p-8 text-error">
    <p>{{ error }}</p>
  </div>

  <BaseHeaderPage
    v-else
    :title="`Cuadre del ${cuadre.fecha}`"
    :description="`ID: ${cuadre.id.slice(0, 8)}...`"
    leading-icon="i-lucide-clipboard-list"
    :show-button="false"
  >
    <template #trailing>
      <UButton
        variant="outline"
        icon="i-lucide-arrow-left"
        label="Volver"
        to="/cuadres"
      />
    </template>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-4">
        <UCard :ui="{ body: { padding: 'p-0' } }">
          <UTable
            :data="items"
            :columns="columnDefs"
            :empty="items.length ? undefined : 'No hay líneas en este cuadre'"
          >
            <template #producto-cell="{ row }">
              <span>{{ getProductoNombre(row.original.productoId) }}</span>
              <UBadge
                v-if="row.original.esExtra"
                label="Extra"
                color="amber"
                size="xs"
              />
            </template>

            <template #precioVentaUsado-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.precioVentaUsado) }}</span>
            </template>

            <template #cantidad-cell="{ row }">
              <span class="font-mono">{{ row.original.cantidad }}</span>
            </template>

            <template #tipoLinea-cell="{ row }">
              <UBadge :label="row.original.tipoLinea" color="neutral" size="xs" />
            </template>

            <template #subtotal-cell="{ row }">
              <span class="font-mono font-semibold">{{ fmtPrecio(row.original.subtotal) }}</span>
            </template>
          </UTable>
        </UCard>
      </div>

      <div class="space-y-4">
        <CuadreResumenCerrado :cuadre="cuadre" />
      </div>
    </div>
  </BaseHeaderPage>
</template>
