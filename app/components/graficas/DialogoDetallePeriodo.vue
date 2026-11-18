<template>
  <BaseDialog
    v-model="isOpen"
    :title="titulo"
    :description="etiquetaPeriodo"
    cancel-text="Cerrar"
    :hide-confirm="true"
    :loading="cargando"
    @cancel="isOpen = false"
  >
    <div v-if="cargando" class="flex items-center justify-center h-40">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
    </div>

    <template v-else-if="detalle">
      <!-- Barra del cuadre: productos del turno y su ganancia neta. -->
      <template v-if="tipo === 'cuadre'">
        <BaseTable
          :data="detalle.lineas"
          :columns="columnDefs"
          :show-edit="false"
          :show-delete="false"
          :pagination="false"
          :disable-filters="true"
          empty-state="No se vendió nada en este período."
        >
          <!-- Misma celda que en el cuadre: el producto arriba y debajo la
               descripción junto al número que importa. En el cuadre ese número
               es el precio de venta; aquí es lo que dejó el producto. -->
          <template #producto-cell="{ row }">
            <div class="min-w-0">
              <p class="font-medium truncate max-w-52">
                {{ row.original.nombre }}
              </p>
              <p class="text-xs text-muted truncate max-w-52">
                <span v-if="row.original.descripcion">{{ row.original.descripcion }} · </span>
                <span
                  class="font-mono"
                  :class="row.original.ganancia < 0 ? 'text-error' : 'text-success'"
                >
                  {{ row.original.ganancia < 0 ? '−' : '+' }}{{ fmtPrecio(Math.abs(row.original.ganancia)) }}
                </span>
              </p>
            </div>
          </template>
        </BaseTable>

        <!-- El desglose va porque la ganancia de la barra es NETA: sin estos
             renglones el total del diálogo no parecería el número de arriba. -->
        <div class="mt-3 rounded-md border border-default px-3 py-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted">Ingreso (subtotales)</span>
            <span class="font-mono">{{ fmtPrecio(totales.ingreso) }}</span>
          </div>
          <div class="flex items-center justify-between text-muted">
            <span>Costo de la mercancía (FIFO)</span>
            <span class="font-mono">−{{ fmtPrecio(totales.costo) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-default pt-1 mt-1 font-medium">
            <span>Ganancia de los productos</span>
            <span class="font-mono">{{ fmtPrecio(totales.gananciaProductos) }}</span>
          </div>
          <div
            v-if="totales.descuentos"
            class="flex items-center justify-between text-muted"
          >
            <span>Regalos y descuentos</span>
            <span class="font-mono">−{{ fmtPrecio(totales.descuentos) }}</span>
          </div>
          <div
            v-if="totales.pagoTrabajador"
            class="flex items-center justify-between text-muted"
          >
            <span>Pago al trabajador</span>
            <span class="font-mono">−{{ fmtPrecio(totales.pagoTrabajador) }}</span>
          </div>
          <div
            class="flex items-center justify-between border-t border-default pt-1 mt-1 font-semibold"
            :class="totales.gananciaNeta < 0 ? 'text-error' : 'text-success'"
          >
            <span>Ganancia neta del período</span>
            <span class="font-mono">{{ fmtPrecio(totales.gananciaNeta) }}</span>
          </div>
        </div>
      </template>

      <!-- Barra de fuera de cuadre: cada salida con su producto y cliente. -->
      <template v-else>
        <BaseTable
          :data="detalle.lineas"
          :columns="columnasFuera"
          :show-edit="false"
          :show-delete="false"
          :pagination="false"
          :disable-filters="true"
          empty-state="No hubo salidas fuera de cuadre en este período."
        >
          <template #fecha-cell="{ row }">
            {{ row.original.fecha ? fmtDate(row.original.fecha) : '—' }}
          </template>

          <template #etiqueta-cell="{ row }">
            <UBadge
              :color="colorTipo(row.original.tipo)"
              variant="soft"
              size="sm"
              :label="row.original.etiqueta"
            />
          </template>

          <template #producto-cell="{ row }">
            <div class="min-w-0">
              <p class="font-medium truncate max-w-52">
                {{ row.original.producto }}
              </p>
              <p
                v-if="row.original.motivo"
                class="text-xs text-muted truncate max-w-52"
              >
                {{ row.original.motivo }}
              </p>
            </div>
          </template>

          <template #cliente-cell="{ row }">
            <span class="block max-w-36 truncate">{{ row.original.cliente || '—' }}</span>
          </template>

          <template #ingreso-cell="{ row }">
            <span class="font-mono">{{ fmtPrecio(row.original.ingreso) }}</span>
          </template>

          <template #ganancia-cell="{ row }">
            <span
              class="font-mono"
              :class="row.original.ganancia < 0 ? 'text-error' : 'text-success'"
            >
              {{ row.original.ganancia < 0 ? '−' : '' }}{{ fmtPrecio(Math.abs(row.original.ganancia)) }}
            </span>
          </template>
        </BaseTable>

        <!-- Mismo cierre que el cuadre: ingreso − costo = ganancia de las ventas,
             menos las mermas, da la ganancia neta. -->
        <div class="mt-3 rounded-md border border-default px-3 py-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted">Ventas directas</span>
            <span class="font-mono">{{ fmtPrecio(totales.ventas) }}</span>
          </div>
          <div class="flex items-center justify-between text-muted">
            <span>Deudas directas</span>
            <span class="font-mono">{{ fmtPrecio(totales.deudas) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-default pt-1 mt-1 font-medium">
            <span>Ingreso del período</span>
            <span class="font-mono">{{ fmtPrecio(totales.ingreso) }}</span>
          </div>
          <div class="flex items-center justify-between text-muted">
            <span>Costo de la mercancía (FIFO)</span>
            <span class="font-mono">−{{ fmtPrecio(totales.costo) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-default pt-1 mt-1 font-medium">
            <span>Ganancia de las ventas</span>
            <span class="font-mono">{{ fmtPrecio(totales.gananciaProductos) }}</span>
          </div>
          <div
            v-if="totales.mermas"
            class="flex items-center justify-between text-muted"
          >
            <span>Mermas (pérdida)</span>
            <span class="font-mono">−{{ fmtPrecio(Math.abs(totales.mermas)) }}</span>
          </div>
          <div
            class="flex items-center justify-between border-t border-default pt-1 mt-1 font-semibold"
            :class="totales.ganancia < 0 ? 'text-error' : 'text-success'"
          >
            <span>Ganancia neta fuera de cuadre</span>
            <span class="font-mono">{{ fmtPrecio(totales.ganancia) }}</span>
          </div>
        </div>
      </template>
    </template>

    <p v-else class="py-6 text-center text-sm text-muted">
      No hay datos de este período.
    </p>
  </BaseDialog>
</template>

<script setup>
import { detalleFueraDeCuadrePeriodo, detalleGananciaPeriodo } from '~/utils/graficas'

const props = defineProps({
  /** Clave del período tal como la agrupa la gráfica: 'YYYY-MM-DD', 'AAAA-W07' o 'YYYY-MM'. */
  periodo: { type: String, default: '' },
  /**
   * Barra que se abrió. 'cuadre' desglosa los productos del turno; 'fuera'
   * desglosa ventas directas, deudas directas y mermas.
   */
  tipo: { type: String, default: 'cuadre' },
  agrupacion: { type: String, default: 'dia' },
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' }
})

const isOpen = defineModel({ type: Boolean, default: false })

const cargando = ref(false)
const detalle = ref(null)

const titulo = computed(() =>
  props.tipo === 'fuera' ? 'Detalle fuera de cuadre' : 'Detalle del cuadre'
)

/** El período se guarda como clave; aquí se lee como lo escribiría una persona. */
const etiquetaPeriodo = computed(() => {
  const p = String(props.periodo ?? '')
  if (!p) return ''
  if (props.agrupacion === 'semana') {
    const [anio, semana] = p.split('-W')
    return `Semana ${Number(semana)} de ${anio}`
  }
  if (props.agrupacion === 'mes') {
    const [anio, mes] = p.split('-')
    return new Date(Number(anio), Number(mes) - 1, 1)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  }
  return fmtDate(p)
})

const totales = computed(() => {
  if (props.tipo === 'fuera') {
    return detalle.value?.totales ?? {
      ingreso: 0,
      costo: 0,
      ventas: 0,
      deudas: 0,
      mermas: 0,
      gananciaProductos: 0,
      ganancia: 0
    }
  }
  return detalle.value?.totales ?? {
    ingreso: 0,
    costo: 0,
    gananciaProductos: 0,
    descuentos: 0,
    pagoTrabajador: 0,
    gananciaNeta: 0
  }
})

const COLOR_TIPO = {
  directa: 'primary',
  casa: 'info',
  familiar: 'warning',
  regalo: 'neutral',
  fiado: 'info',
  merma: 'error'
}
const colorTipo = t => COLOR_TIPO[t] ?? 'neutral'

// Se carga al abrir y cada vez que cambia algo de la petición. Depender solo de
// la transición cerrado→abierto dejaba el desglose anterior en pantalla si el
// diálogo seguía abierto (o se reabría sin cerrarse antes).
let cargaId = 0

async function cargar() {
  if (!isOpen.value) {
    // Cerrar invalida la carga en vuelo: su respuesta ya no interesa.
    cargaId++
    detalle.value = null
    cargando.value = false
    return
  }
  // Cada petición lleva su id: si se toca otra barra mientras carga la anterior,
  // la respuesta vieja no pisa la nueva.
  const id = ++cargaId
  cargando.value = true
  detalle.value = null
  try {
    const traer = props.tipo === 'fuera'
      ? detalleFueraDeCuadrePeriodo
      : detalleGananciaPeriodo
    const datos = await traer({
      periodo: props.periodo,
      agrupacion: props.agrupacion,
      desde: props.desde,
      hasta: props.hasta
    })
    if (id === cargaId) detalle.value = datos
  } catch {
    if (id === cargaId) detalle.value = null
  } finally {
    if (id === cargaId) cargando.value = false
  }
}

watch(
  [
    isOpen,
    () => props.periodo,
    () => props.tipo,
    () => props.agrupacion,
    () => props.desde,
    () => props.hasta
  ],
  cargar
)

// El cuerpo del modal ya hace scroll (el base de Nuxt UI lo trae con
// overflow-y-auto), así que un mes con muchos productos no empuja los botones
// fuera de la pantalla: solo se listan, sin paginar ni filtros.
const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'cantidad', header: 'Cantidad' },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: 'currency' }
]

const columnasFuera = [
  { accessorKey: 'fecha', header: 'Fecha' },
  { accessorKey: 'etiqueta', header: 'Tipo' },
  { accessorKey: 'producto', header: 'Producto' },
  { accessorKey: 'cliente', header: 'Cliente' },
  { accessorKey: 'ingreso', header: 'Ingreso' },
  { accessorKey: 'ganancia', header: 'Ganancia' }
]
</script>
