<script setup>
import { calcularGrafica } from '~~/app/utils/graficas'

const productoConfig = { tabla: 'productos', endpoints: { list: '/api/productos', byId: id => `/api/productos/${id}` }, puestoScoped: true }

definePageMeta({
  middleware: ['jefe']
})
const productoRepo = useLocalRepo(productoConfig)

const graficas = [
  { key: 'productos-mas-vendidos', titulo: 'Productos más vendidos', descripcion: 'Top 10 por cantidad total vendida', icon: 'i-lucide-trending-up' },
  { key: 'productos-mayor-ganancia', titulo: 'Productos con mayor ganancia', descripcion: 'Top 10 por ganancia total (venta - compra) × cantidad', icon: 'i-lucide-coin' },
  { key: 'productos-menor-rotacion', titulo: 'Productos con menor rotación', descripcion: 'Productos activos con menos ventas en el período', icon: 'i-lucide-package-x' },
  { key: 'evolucion-producto', titulo: 'Evolución de un producto', descripcion: 'Ventas diarias de un producto seleccionado', icon: 'i-lucide-line-chart' },
  { key: 'precio-usado-vs-oficial', titulo: 'Precio usado vs. oficial', descripcion: 'Comparativa del precio de venta usado en cuadre vs. precio oficial', icon: 'i-lucide-git-compare' },
  { key: 'ganancia-por-periodo', titulo: 'Ganancia por período', descripcion: 'Ganancia neta agrupada por día/semana/mes', icon: 'i-lucide-bar-chart-2', params: { agrupacion: 'dia' } },
  { key: 'ingresos-por-periodo', titulo: 'Ingresos por período', descripcion: 'Total de ventas agrupado por día/semana/mes', icon: 'i-lucide-dollar-sign', params: { agrupacion: 'dia' } },
  { key: 'regalos-descuentos-por-periodo', titulo: 'Regalos y descuentos por período', descripcion: 'Cantidad y valor de líneas tipo regalo/descuento familiar', icon: 'i-lucide-gift', params: { agrupacion: 'dia' } },
  { key: 'proporcion-formas-pago', titulo: 'Proporción de formas de pago', descripcion: 'Efectivo vs. transferencia vs. fiado', icon: 'i-lucide-pie-chart' },
  { key: 'estado-cuadres', titulo: 'Estado de cuadres', descripcion: 'Cuadres abiertos vs. cerrados vs. reabiertos', icon: 'i-lucide-clipboard-list' },
  { key: 'faltantes-sobrantes-acumulados', titulo: 'Faltantes y sobrantes acumulados', descripcion: 'Suma de diferencias por día/mes', icon: 'i-lucide-minus-circle', params: { agrupacion: 'dia' } },
  { key: 'cuadres-reabiertos', titulo: 'Cuadres reabiertos', descripcion: 'Historial de reaperturas con fechas', icon: 'i-lucide-rotate-ccw' },
  { key: 'pagos-trabajadores', titulo: 'Pagos a trabajadores', descripcion: 'Total pagado a cada trabajador por período', icon: 'i-lucide-users' },
  { key: 'comparativa-por-trabajador', titulo: 'Comparativa por trabajador', descripcion: 'Ventas y diferencias comparadas entre trabajadores', icon: 'i-lucide-user-round-cog' }
]

const graficaActiva = ref(null)
const datosGrafica = ref([])
const cargando = ref(false)
const fechaDesde = ref('')
const fechaHasta = ref('')
const agrupacion = ref('dia')
const productoSeleccionado = ref('')

const productosParaSelector = ref([])

onMounted(async () => {
  const hoy = new Date().toISOString().split('T')[0]
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  fechaDesde.value = hace30
  fechaHasta.value = hoy

  const prods = await productoRepo.readAll({ orderBy: 'nombre' })
  productosParaSelector.value = prods.map(p => ({ label: p.nombre, value: p.id }))
})

async function cargarGrafica(g) {
  if (g.key === 'evolucion-producto' || g.key === 'precio-usado-vs-oficial') {
    if (!productoSeleccionado.value) {
      return
    }
  }

  graficaActiva.value = g
  cargando.value = true
  try {
    datosGrafica.value = await calcularGrafica(g.key, {
      desde: fechaDesde.value,
      hasta: fechaHasta.value,
      agrupacion: agrupacion.value,
      productoId: productoSeleccionado.value
    })
  } catch {
    datosGrafica.value = []
  } finally {
    cargando.value = false
  }
}

function getChartComponent(key) {
  if (key === 'evolucion-producto' || key === 'precio-usado-vs-oficial') return 'LineChart'
  if (key === 'proporcion-formas-pago') return 'PieChart'
  return 'BarChart'
}

function getChartConfig(key) {
  const configs = {
    'productos-mas-vendidos': { xKey: 'nombre', yKeys: ['totalVendido'], labels: { nombre: 'Producto', totalVendido: 'Cantidad vendida' } },
    'productos-mayor-ganancia': { xKey: 'nombre', yKeys: ['gananciaTotal'], labels: { nombre: 'Producto', gananciaTotal: 'Ganancia' } },
    'productos-menor-rotacion': { xKey: 'nombre', yKeys: ['totalVendido'], labels: { nombre: 'Producto', totalVendido: 'Cantidad vendida' } },
    'evolucion-producto': { xKey: 'fecha', yKeys: ['cantidadVendida'], labels: { fecha: 'Fecha', cantidadVendida: 'Cantidad' } },
    'precio-usado-vs-oficial': { xKey: 'fecha', yKeys: ['precioVentaUsado', 'precioOficialActual'], labels: { fecha: 'Fecha', precioVentaUsado: 'Precio usado', precioOficialActual: 'Precio oficial' } },
    'ganancia-por-periodo': { xKey: 'periodo', yKeys: ['ganancia'], labels: { periodo: 'Período', ganancia: 'Ganancia' } },
    'ingresos-por-periodo': { xKey: 'periodo', yKeys: ['ingresoTotal'], labels: { periodo: 'Período', ingresoTotal: 'Ingreso total' } },
    'regalos-descuentos-por-periodo': { xKey: 'periodo', yKeys: ['valorRegalado', 'valorDescontado'], labels: { periodo: 'Período', valorRegalado: 'Valor regalado', valorDescontado: 'Valor descontado' } },
    'proporcion-formas-pago': { nameKey: 'forma', valueKey: 'total', labels: { forma: 'Forma', total: 'Total' } },
    'estado-cuadres': { xKey: 'estado', yKeys: ['cantidad'], labels: { estado: 'Estado', cantidad: 'Cantidad' } },
    'faltantes-sobrantes-acumulados': { xKey: 'periodo', yKeys: ['diferencia'], labels: { periodo: 'Período', diferencia: 'Diferencia' } },
    'cuadres-reabiertos': { xKey: 'fecha', yKeys: ['reabiertoVeces'], labels: { fecha: 'Fecha', reabiertoVeces: 'Reaperturas' } },
    'pagos-trabajadores': { xKey: 'trabajadorNombre', yKeys: ['totalPagado'], labels: { trabajadorNombre: 'Trabajador', totalPagado: 'Total pagado' } },
    'comparativa-por-trabajador': { xKey: 'trabajadorNombre', yKeys: ['totalCuadres', 'diferenciaPromedio', 'cuadresConFaltante'], labels: { trabajadorNombre: 'Trabajador', totalCuadres: 'Cuadres', diferenciaPromedio: 'Dif. promedio', cuadresConFaltante: 'Con faltante' } }
  }
  return configs[key] || {}
}
</script>

<template>
  <div class="space-y-4">
    <UPageHeader
      title="Gráficas del negocio"
      description="Análisis de ventas, finanzas y operaciones"
      leading-icon="i-lucide-bar-chart-2"
      class="pb-0"
    />

    <!-- Filtros globales -->
    <UCard class="bg-muted/30">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="Desde" class="w-40">
          <UInputDate v-model="fechaDesde" />
        </UFormField>
        <UFormField label="Hasta" class="w-40">
          <UInputDate v-model="fechaHasta" />
        </UFormField>
        <UFormField
          v-if="graficaActiva?.params?.agrupacion"
          label="Agrupación"
          class="w-36"
        >
          <USelectMenu
            v-model="agrupacion"
            :items="[
              { label: 'Día', value: 'dia' },
              { label: 'Semana', value: 'semana' },
              { label: 'Mes', value: 'mes' }
            ]"
            @update:model-value="graficaActiva && cargarGrafica(graficaActiva)"
          />
        </UFormField>
        <UFormField
          v-if="
            graficaActiva
              && (graficaActiva.key === 'evolucion-producto'
                || graficaActiva.key === 'precio-usado-vs-oficial')
          "
          label="Producto"
          class="w-56"
        >
          <USelectMenu
            v-model="productoSeleccionado"
            :items="productosParaSelector"
            placeholder="Seleccionar..."
            @update:model-value="graficaActiva && cargarGrafica(graficaActiva)"
          />
        </UFormField>
        <UButton
          v-if="graficaActiva"
          color="primary"
          icon="i-lucide-refresh-cw"
          label="Actualizar"
          :loading="cargando"
          @click="cargarGrafica(graficaActiva)"
        />
      </div>
    </UCard>

    <!-- Grid de tarjetas de gráficas -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <UCard
        v-for="g in graficas"
        :key="g.key"
        class="cursor-pointer hover:shadow-lg transition-shadow"
        :class="{ 'ring-2 ring-primary': graficaActiva?.key === g.key }"
        @click="cargarGrafica(g)"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon :name="g.icon" class="size-5 text-primary" />
            <h3 class="font-medium text-sm">
              {{ g.titulo }}
            </h3>
          </div>
        </template>
        <p class="text-xs text-muted">
          {{ g.descripcion }}
        </p>
      </UCard>
    </div>

    <!-- Vista de gráfica seleccionada -->
    <UCard v-if="graficaActiva" class="min-h-[500px]">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon :name="graficaActiva.icon" class="size-5 text-primary" />
            <h3 class="font-semibold">
              {{ graficaActiva.titulo }}
            </h3>
          </div>
          <UButton
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            @click="graficaActiva = null"
          />
        </div>
      </template>

      <div v-if="cargando" class="flex items-center justify-center h-96">
        <USpinner size="lg" />
      </div>

      <div
        v-else-if="datosGrafica.length === 0"
        class="flex items-center justify-center h-96 text-muted"
      >
        Sin datos para el período seleccionado
      </div>

      <div v-else class="h-96">
        <component
          :is="getChartComponent(graficaActiva.key)"
          :data="datosGrafica"
          :config="getChartConfig(graficaActiva.key)"
        />
      </div>
    </UCard>
  </div>
</template>
