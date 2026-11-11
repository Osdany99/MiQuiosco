<template>
  <BaseHeaderPage
    title="Salidas fuera de cuadre"
    description="Ventas, ventas de casa, familiares y regalos registrados fuera del cuadre"
    leading-icon="i-lucide-receipt"
    :show-button="false"
  >
    <UAlert
      v-if="!cargando && ventas.length === 0"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      title="Todavía no hay salidas fuera del cuadre"
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

    <BaseTable
      v-if="cargando || ventas.length > 0"
      :data="ventasDelDia"
      :columns="columnas"
      :loading-prop="cargando"
      :filter-fields="camposFiltro"
      :show-edit="false"
      :show-delete="false"
      :empty-state="textoVacio"
      :ui="uiTabla"
    >
      <template #toolbar-leading>
        <UInputDate v-model="dia" size="sm" class="w-44" />
      </template>

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

      <template #tipoVenta-cell="{ row }">
        <UBadge
          :color="colorTipo(row.original.tipoVenta)"
          :icon="iconoTipo(row.original.tipoVenta)"
          variant="soft"
          size="sm"
          :label="etiquetaTipo(row.original.tipoVenta)"
        />
      </template>

      <template #nombreCliente-cell="{ row }">
        <span class="block max-w-40 truncate">{{ row.original.nombreCliente || '—' }}</span>
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
          {{ fmtPrecio(row.original.cantidad) }}
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
        <span
          class="font-mono font-medium"
          :class="(Number(row.original.ganancia) || 0) < 0 ? 'text-error' : 'text-success'"
        >
          {{ fmtPrecio(row.original.ganancia) }}
        </span>
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
    </BaseTable>
  </BaseHeaderPage>
</template>

<script setup>
import { CalendarDate } from '@internationalized/date'
import { aDia } from '../../shared/inventario/analitica'

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
  { accessorKey: 'tipoVenta', header: 'Tipo' },
  { accessorKey: 'ubicacion', header: 'Sale de' },
  { accessorKey: 'nombreProducto', header: 'Producto' },
  { accessorKey: 'nombreCliente', header: 'Cliente' },
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

// Filtros del botón de BaseTable. Se declaran a mano para que Tipo y Sale de
// sean selects exactos en vez de campos de texto.
const camposFiltro = [
  { key: 'nombreProducto', label: 'Producto' },
  {
    key: 'tipoVenta',
    label: 'Tipo',
    type: 'select',
    options: [
      { label: 'Directa', value: 'directa' },
      { label: 'Casa', value: 'casa' },
      { label: 'Familiar', value: 'familiar' },
      { label: 'Regalo', value: 'regalo' }
    ]
  },
  { key: 'nombreCliente', label: 'Cliente' },
  {
    key: 'ubicacion',
    label: 'Sale de',
    type: 'select',
    options: [
      { label: 'Quiosco', value: 'quiosco' },
      { label: 'Almacén', value: 'almacen' }
    ]
  }
]

const TIPOS = {
  directa: { label: 'Directa', icon: 'i-lucide-pocket', color: 'primary' },
  casa: { label: 'Casa', icon: 'i-lucide-house', color: 'info' },
  familiar: { label: 'Familiar', icon: 'i-lucide-users', color: 'warning' },
  regalo: { label: 'Regalo', icon: 'i-lucide-gift', color: 'neutral' }
}

const etiquetaTipo = t => TIPOS[t]?.label ?? 'Directa'
const iconoTipo = t => TIPOS[t]?.icon ?? TIPOS.directa.icon
const colorTipo = t => TIPOS[t]?.color ?? TIPOS.directa.color

const cargando = ref(true)
const crudas = ref([])

function calendarioDeHoy() {
  const h = new Date()
  return new CalendarDate(h.getFullYear(), h.getMonth() + 1, h.getDate())
}

/**
 * Día que se está mirando. Arranca en hoy: las salidas se revisan el mismo día
 * que ocurren. Se filtra en cliente sobre lo ya cargado (una sola lectura y la
 * navegación entre días es instantánea); si se limpia la fecha se ven todas.
 */
const dia = ref(calendarioDeHoy())
const diaISO = computed(() => (dia.value ? String(dia.value) : ''))

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

const ventasDelDia = computed(() => {
  const d = diaISO.value
  if (!d) return ventas.value
  return ventas.value.filter(v => aDia(v.creadoEn) === d)
})

const textoVacio = computed(() =>
  diaISO.value ? `Sin salidas el ${fmtDate(diaISO.value)}` : 'Sin ventas directas'
)

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
