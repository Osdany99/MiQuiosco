<template>
  <BaseHeaderPage
    title="Venta directa"
    description="Ventas en efectivo hechas fuera del cuadre"
    leading-icon="i-lucide-receipt"
    :show-button="false"
  >
    <UAlert
      v-if="!cargando && ventas.length === 0"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      title="Todavía no hay ventas directas"
      description="Se registran desde la acción Vender de cada producto en Quiosco o Almacén."
      class="mb-4"
    >
      <template #actions>
        <UButton
          to="/almacen"
          label="Ir a Almacén"
          size="sm"
          color="warning"
          variant="soft"
        />
      </template>
    </UAlert>

    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <template v-else-if="ventas.length > 0">
      <div class="flex justify-end mb-2">
        <TableToolbar
          v-model:visible-headers="visibleHeaders"
          :column-headers="columnHeaders"
        />
      </div>

      <UTable
        :data="ventas"
        :columns="visibleColumns"
        :ui="uiTabla"
        empty="Sin ventas directas"
      >
        <template #nombreProducto-cell="{ row }">
          <div class="min-w-0">
            <div class="flex items-center gap-1 min-w-0">
              <span class="font-medium truncate">
                {{ row.original.nombreProducto }}
              </span>
              <UBadge
                v-if="row.original.otrasLineas > 0"
                color="neutral"
                variant="outline"
                size="sm"
                :label="`+${row.original.otrasLineas}`"
              />
            </div>
            <div
              v-if="row.original.descripcionProducto?.trim()"
              class="text-xs text-muted truncate"
            >
              {{ row.original.descripcionProducto }}
            </div>
          </div>
        </template>

        <template #creadoEn-cell="{ row }">
          {{ fmtDate(row.original.creadoEn) }}
        </template>

        <template #ubicacion-cell="{ row }">
          <UBadge
            variant="soft"
            size="sm"
            color="neutral"
            :icon="row.original.ubicacion === 'quiosco' ? 'i-lucide-store' : 'i-lucide-warehouse'"
            :label="row.original.ubicacion === 'quiosco' ? 'Quiosco' : 'Almacén'"
          />
        </template>

        <template #cantidad-cell="{ row }">
          <span class="font-mono">
            {{ fmtPrecio(row.original.cantidad) }}<span
              v-if="row.original.unidad"
              class="text-muted text-xs ml-1"
            >{{ row.original.unidad }}</span>
          </span>
        </template>

        <template #precioVenta-cell="{ row }">
          <span class="font-mono">{{ fmtPrecio(row.original.precioVenta) }}</span>
        </template>

        <template #montoTotal-cell="{ row }">
          <span class="font-mono">{{ fmtPrecio(row.original.montoTotal) }}</span>
        </template>

        <template #costoTotal-cell="{ row }">
          <span class="font-mono">{{ fmtPrecio(row.original.costoTotal) }}</span>
        </template>

        <template #ganancia-cell="{ row }">
          <span class="font-mono font-medium text-success">{{ fmtPrecio(row.original.ganancia) }}</span>
        </template>

        <template #margen-cell="{ row }">
          <span
            v-if="row.original.margen != null"
            class="font-mono"
            :class="row.original.margen >= 0 ? 'text-success' : 'text-error'"
          >
            {{ row.original.margen }}%
          </span>
          <span v-else class="text-muted">—</span>
        </template>

        <template #nombreUsuario-cell="{ row }">
          {{ row.original.nombreUsuario ?? '—' }}
        </template>

        <template #notas-cell="{ row }">
          <span class="text-sm text-muted truncate block max-w-56">
            {{ row.original.notas || '—' }}
          </span>
        </template>

        <template #id-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.id }}</span>
        </template>
      </UTable>
    </template>
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const inv = useInventario()

const uiTabla = { td: 'px-3 py-2' }

// Una venta directa es de un solo producto con N unidades, así que la fila es
// la venta: el producto de su línea y las unidades que salieron. 'Cant.',
// 'Costo', 'Ganancia', 'Margen %', 'Quién', 'Notas' e 'ID' quedan apagados de
// entrada (el detalle se abre desde el selector) porque lo que se mira de
// frente es qué se vendió y por cuánto entró, no el FIFO que consumió.
const columnas = [
  { accessorKey: 'creadoEn', header: 'Fecha' },
  { accessorKey: 'ubicacion', header: 'Sale de' },
  { accessorKey: 'nombreProducto', header: 'Producto' },
  { accessorKey: 'cantidad', header: 'Cant.', visible: false },
  { accessorKey: 'precioVenta', header: 'Precio venta' },
  { accessorKey: 'montoTotal', header: 'Total' },
  { accessorKey: 'costoTotal', header: 'Costo', visible: false },
  { accessorKey: 'ganancia', header: 'Ganancia', visible: false },
  { accessorKey: 'margen', header: 'Margen %', visible: false },
  { accessorKey: 'nombreUsuario', header: 'Quién', visible: false },
  { accessorKey: 'notas', header: 'Notas', visible: false },
  { accessorKey: 'id', header: 'ID', visible: false }
]

// Selector de columnas (misma regla que BaseTable y useVistaInventario): lo
// visible sale del propio flag `visible` de cada columna, y las de header vacío
// serían estructurales y quedarían fuera del selector.
const visibleHeaders = ref(columnas.filter(c => c.visible !== false).map(c => c.header))
const columnHeaders = computed(() => columnas.filter(c => c.header).map(c => c.header))
const visibleColumns = computed(() => columnas.filter(c => visibleHeaders.value.includes(c.header)))

const cargando = ref(true)
const crudas = ref([])

const ventas = computed(() => crudas.value.map((v) => {
  const lineas = v.lineas ?? []
  const principal = lineas[0]
  const unidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
  const total = Number(v.montoTotal) || 0
  const ganancia = Number(v.ganancia) || 0
  return {
    ...v,
    nombreProducto: principal?.nombreProducto ?? 'Sin producto',
    descripcionProducto: principal?.descripcionProducto ?? null,
    // Si algún día una venta trae más de una línea, el badge avisa en vez de
    // fingir que el producto mostrado es el único.
    otrasLineas: Math.max(0, lineas.length - 1),
    unidad: principal?.unidad ?? null,
    cantidad: unidades,
    // Precio unitario real de la venta. Con una sola línea es exactamente el
    // precioVentaUsado de esa línea; con varias, el promedio ponderado.
    precioVenta: unidades > 0 ? total / unidades : 0,
    margen: total > 0 ? Math.round((ganancia / total) * 1000) / 10 : null
  }
}))

async function recargar() {
  cargando.value = true
  try {
    crudas.value = await inv.cargarVentasDirectas() ?? []
  } catch (err) {
    toast.add({ title: 'Error', description: err?.message, color: 'error' })
  } finally {
    cargando.value = false
  }
}

onMounted(recargar)
</script>
