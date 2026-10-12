<template>
  <BaseDialog
    v-model="isOpen"
    title="Detalle del período"
    :description="etiquetaPeriodo"
    cancel-text="Cerrar"
    :hide-confirm="true"
    :loading="cargando"
  >
    <div v-if="cargando" class="flex items-center justify-center h-40">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
    </div>

    <template v-else-if="detalle">
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
             descripción junto al número que importa. En el cuadre ese número es
             el precio de venta; aquí es lo que dejó el producto. -->
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

    <p v-else class="py-6 text-center text-sm text-muted">
      No hay datos de este período.
    </p>
  </BaseDialog>
</template>

<script setup>
import { detalleGananciaPeriodo } from '~/utils/graficas'

const props = defineProps({
  /** Clave del período tal como la agrupa la gráfica: 'YYYY-MM-DD', 'AAAA-W07' o 'YYYY-MM'. */
  periodo: { type: String, default: '' },
  agrupacion: { type: String, default: 'dia' },
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' }
})

const isOpen = defineModel({ type: Boolean, default: false })

const cargando = ref(false)
const detalle = ref(null)

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

const totales = computed(() => detalle.value?.totales ?? {
  ingreso: 0,
  costo: 0,
  gananciaProductos: 0,
  descuentos: 0,
  pagoTrabajador: 0,
  gananciaNeta: 0
})

// Se carga al abrir, no al montar: el detalle depende de la barra que se tocó
// y de los filtros que había en ese momento.
watch(isOpen, async (abierto) => {
  if (!abierto) return
  cargando.value = true
  detalle.value = null
  try {
    detalle.value = await detalleGananciaPeriodo({
      periodo: props.periodo,
      agrupacion: props.agrupacion,
      desde: props.desde,
      hasta: props.hasta
    })
  } catch {
    detalle.value = null
  } finally {
    cargando.value = false
  }
})

// El cuerpo del modal ya hace scroll (el base de Nuxt UI lo trae con
// overflow-y-auto), así que un mes con muchos productos no empuja los botones
// fuera de la pantalla: solo se listan, sin paginar ni filtros.
const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'cantidad', header: 'Cantidad' },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: 'currency' }
]
</script>
