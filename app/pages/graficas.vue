<script setup>
/**
 * /graficas — Análisis del negocio.
 *
 * El catálogo está en SECCIONES porque son 38 gráficas y una lista sola de
 * tarjetas deja deserve para elegir. Cada descriptor lleva lo que la gráfica
 * necesita saber de sí misma (qué componente la dibuja, si necesita producto,
 * si ignora el rango), de modo que añadir una gráfica es añadir una línea.
 *
 * Convenciones de los descriptores:
 * - seccion:      'ventas' | 'inventario' | 'ganancia' | 'deudas'
 * - componente:   'bar' | 'bar-horizontal' | 'linea' | 'pie' | 'combo' | 'heatmap'
 * - params:       { agrupacion: 'dia' } → muestra el selector de agrupación
 * - requiereProducto: true → muestra el selector de producto
 * - ignoraRango:  true → es una foto del estado actual, no depende de las fechas
 */
import {
  calcularGrafica, limpiarCacheGraficas, ventanaDeCobertura, resumenNegocio
} from '~/utils/graficas'
import { TABLES } from '../../shared/tables'
import { CalendarDate } from '@internationalized/date'
import { markRaw } from 'vue'
import BarChart from '~/components/graficas/BarChart.vue'
import LineChart from '~/components/graficas/LineChart.vue'
import PieChart from '~/components/graficas/PieChart.vue'
import ComboChart from '~/components/graficas/ComboChart.vue'
import HeatmapChart from '~/components/graficas/HeatmapChart.vue'

const productoConfig = TABLES.productos

definePageMeta({
  middleware: ['jefe']
})
const productoRepo = useRepo(productoConfig, { toast: false })

const COMPONENTES = {
  'bar': BarChart,
  'bar-horizontal': BarChart,
  'linea': LineChart,
  'pie': PieChart,
  'combo': ComboChart,
  'heatmap': HeatmapChart
}

const SECCIONES = [
  { value: 'ganancia', label: 'Ganancia y caja' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'deudas', label: 'Deudas' }
]

const graficas = [
  // ---------- Ganancia y caja ----------
  { key: 'ganancia-por-periodo', seccion: 'ganancia', componente: 'bar', titulo: 'Ganancia por período', descripcion: 'Ganancia neta agrupada por día/semana/mes', icon: 'i-lucide-bar-chart-2', params: { agrupacion: 'dia' } },
  { key: 'ganancia-real-fifo', seccion: 'ganancia', componente: 'bar-horizontal', titulo: 'Ganancia real por producto', descripcion: 'Ingreso menos el costo FIFO del lote que se consumió', icon: 'i-lucide-coins' },
  { key: 'margen-porcentaje-producto', seccion: 'ganancia', componente: 'bar-horizontal', titulo: 'Margen real por producto', descripcion: 'Ganancia sobre el ingreso, en porcentaje', icon: 'i-lucide-percent' },
  { key: 'diferencia-estimada-real', seccion: 'ganancia', componente: 'bar-horizontal', titulo: 'Estimado vs. real', descripcion: 'Cuánto se desvía la estimación del FIFO real', icon: 'i-lucide-git-compare-arrows' },
  { key: 'ingresos-por-periodo', seccion: 'ganancia', componente: 'bar', titulo: 'Ingresos por período', descripcion: 'Total de ventas agrupado por día/semana/mes', icon: 'i-lucide-dollar-sign', params: { agrupacion: 'dia' } },
  { key: 'ingresos-fuera-de-cuadre', seccion: 'ganancia', componente: 'linea', titulo: 'Ingresos fuera de cuadre', descripcion: 'Ventas directas y deudas directas: venta y ganancia por período', icon: 'i-lucide-pocket', params: { agrupacion: 'dia' } },
  { key: 'regalos-descuentos-por-periodo', seccion: 'ganancia', componente: 'bar', titulo: 'Regalos y descuentos', descripcion: 'Cantidad y valor de líneas tipo regalo/descuento familiar', icon: 'i-lucide-gift', params: { agrupacion: 'dia' } },
  { key: 'faltantes-sobrantes-acumulados', seccion: 'ganancia', componente: 'bar', titulo: 'Faltantes y sobrantes', descripcion: 'Suma de diferencias por día/mes', icon: 'i-lucide-minus-circle', params: { agrupacion: 'dia' } },
  { key: 'pagos-trabajadores', seccion: 'ganancia', componente: 'bar', titulo: 'Pagos a trabajadores', descripcion: 'Total pagado a cada trabajador por período', icon: 'i-lucide-users' },
  { key: 'comparativa-por-trabajador', seccion: 'ganancia', componente: 'bar', titulo: 'Comparativa por trabajador', descripcion: 'Ventas y diferencias comparadas entre trabajadores', icon: 'i-lucide-user-round-cog' },

  // ---------- Inventario ----------
  { key: 'dias-cobertura', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Días de cobertura', descripcion: 'Cuánto aguanta el stock al ritmo de venta actual', icon: 'i-lucide-timer' },
  { key: 'estado-stock', seccion: 'inventario', componente: 'pie', titulo: 'Estado del quiosco', descripcion: 'OK, reponer, bajo mínimo y no se vende', icon: 'i-lucide-package-check', ignoraRango: true },
  { key: 'valor-inventario-producto', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Valor del inventario', descripcion: 'Cuánta plata está parada, por producto y ubicación', icon: 'i-lucide-warehouse', ignoraRango: true },
  { key: 'stock-almacen-vs-quiosco', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Almacén vs. quiosco', descripcion: 'Unidades de cada producto en cada ubicación', icon: 'i-lucide-arrow-right-left', ignoraRango: true },
  { key: 'capital-dormido', seccion: 'inventario', componente: 'bar', titulo: 'Capital dormido', descripcion: 'Plata en lotes que llevan tiempo sin venderse', icon: 'i-lucide-hourglass', ignoraRango: true },
  { key: 'mermas-por-producto', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Mermas por producto', descripcion: 'Qué se pierde y por qué motivo', icon: 'i-lucide-trash-2', params: { agrupacion: 'dia' } },
  { key: 'compras-vs-mermas', seccion: 'inventario', componente: 'linea', titulo: 'Compras vs. mermas', descripcion: 'Dinero que entra por compras contra el que se pierde', icon: 'i-lucide-scale', params: { agrupacion: 'dia' } },
  { key: 'traspasos-por-periodo', seccion: 'inventario', componente: 'linea', titulo: 'Reposición del quiosco', descripcion: 'Unidades y valor traspasados por día/semana/mes', icon: 'i-lucide-truck', params: { agrupacion: 'dia' } },
  { key: 'dias-sin-reponer', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Días sin reponer', descripcion: 'Productos que llevan más tiempo sin mercadería', icon: 'i-lucide-calendar-x', ignoraRango: true },
  { key: 'cobertura-traspasos', seccion: 'inventario', componente: 'linea', titulo: 'Cobertura de traspasos', descripcion: 'Lo que entra por traspaso contra lo que se vende', icon: 'i-lucide-shuffle', params: { agrupacion: 'dia' } },
  { key: 'inversion-acumulada', seccion: 'inventario', componente: 'linea', titulo: 'Inversión acumulada', descripcion: 'Capital comprado contra capital ya recuperado', icon: 'i-lucide-trending-down', params: { agrupacion: 'dia' } },
  { key: 'anulaciones-periodo', seccion: 'inventario', componente: 'bar', titulo: 'Anulaciones por período', descripcion: 'Cuánto se anuló y se rehízo al reabrir cuadres', icon: 'i-lucide-undo-2', params: { agrupacion: 'dia' } },
  { key: 'fifo-antiguedad-vendida', seccion: 'inventario', componente: 'linea', titulo: 'Antigüedad del lote vendido', descripcion: 'Qué tan viejo era el stock que se vendió cada día', icon: 'i-lucide-history', requiereProducto: true },
  { key: 'evolucion-precio-compra', seccion: 'inventario', componente: 'linea', titulo: 'Evolución del precio de compra', descripcion: 'Precio pagado por entrada, contra el precio de venta', icon: 'i-lucide-tags', requiereProducto: true },
  { key: 'gasto-por-proveedor', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Gasto por proveedor', descripcion: 'A quién se le compra y cuánto', icon: 'i-lucide-store' },
  { key: 'precio-medio-proveedor', seccion: 'inventario', componente: 'bar-horizontal', titulo: 'Precio medio por proveedor', descripcion: 'Qué paga cada proveedor por el mismo producto', icon: 'i-lucide-handshake', requiereProducto: true },
  { key: 'heatmap-producto-dia', seccion: 'inventario', componente: 'heatmap', titulo: 'Qué se vende y cuándo', descripcion: 'Producto × período: fines de semana vs. entre semana', icon: 'i-lucide-grid-3x3', params: { agrupacion: 'dia' } },

  // ---------- Ventas ----------
  { key: 'productos-mas-vendidos', seccion: 'ventas', componente: 'bar-horizontal', titulo: 'Productos más vendidos', descripcion: 'Top 10 por cantidad total vendida', icon: 'i-lucide-trending-up' },
  { key: 'productos-mayor-ganancia', seccion: 'ventas', componente: 'bar-horizontal', titulo: 'Ganancia estimada', descripcion: 'Top 10 estimando el costo con el precio de compra actual', icon: 'i-lucide-coin' },
  { key: 'productos-menor-rotacion', seccion: 'ventas', componente: 'bar-horizontal', titulo: 'Productos con menor rotación', descripcion: 'Productos activos con menos ventas en el período', icon: 'i-lucide-package-x' },
  { key: 'evolucion-producto', seccion: 'ventas', componente: 'linea', titulo: 'Evolución de un producto', descripcion: 'Ventas diarias de un producto seleccionado', icon: 'i-lucide-line-chart', requiereProducto: true },
  { key: 'precio-usado-vs-oficial', seccion: 'ventas', componente: 'linea', titulo: 'Precio usado vs. oficial', descripcion: 'Precio de venta usado en cuadre vs. precio oficial', icon: 'i-lucide-git-compare', requiereProducto: true },
  { key: 'proporcion-formas-pago', seccion: 'ventas', componente: 'pie', titulo: 'Proporción de formas de pago', descripcion: 'Efectivo vs. transferencia vs. fiado', icon: 'i-lucide-pie-chart' },
  { key: 'estado-cuadres', seccion: 'ventas', componente: 'bar', titulo: 'Estado de cuadres', descripcion: 'Cuadres abiertos vs. cerrados vs. reabiertos', icon: 'i-lucide-clipboard-list' },
  { key: 'cuadres-reabiertos', seccion: 'ventas', componente: 'bar', titulo: 'Cuadres reabiertos', descripcion: 'Historial de reaperturas con fechas', icon: 'i-lucide-rotate-ccw' },

  // ---------- Deudas ----------
  { key: 'deuda-por-cliente', seccion: 'deudas', componente: 'bar-horizontal', titulo: 'Deuda por cliente', descripcion: 'Quién debe y cuánto queda', icon: 'i-lucide-hand-coins' },
  { key: 'antiguedad-cartera', seccion: 'deudas', componente: 'pie', titulo: 'Antigüedad de la cartera', descripcion: 'Qué parte de lo que se debe lleva mucho tiempo parado', icon: 'i-lucide-hourglass' },
  { key: 'cobrado-vs-fiado', seccion: 'deudas', componente: 'linea', titulo: 'Cobrado vs. fiado', descripcion: 'Si la cartera crece o se va cerrando', icon: 'i-lucide-arrow-left-right', params: { agrupacion: 'dia' } }
]

// La ganancia por período es la gráfica que se mira casi siempre: es la que
// dice si el día salió bien. Arranca seleccionada para no tener que buscarla.
const GRAFICA_POR_DEFECTO = 'ganancia-por-periodo'
const graficaActiva = ref(graficas.find(g => g.key === GRAFICA_POR_DEFECTO) ?? null)
const seccionActiva = ref(graficaActiva.value.seccion)
const datosGrafica = ref([])
const cargando = ref(false)
const fechaDesde = ref(null)
const fechaHasta = ref(null)
const agrupacion = ref('dia')
const productoSeleccionado = ref('')
const ventanaCoberturaActiva = ref(null)
const kpis = ref(null)

const conexion = useModoConexion()

const productosParaSelector = ref([])

const graficasDeSeccion = computed(() => graficas.filter(g => g.seccion === seccionActiva.value))
const requiereProducto = computed(() => graficaActiva.value?.requiereProducto === true)
const rangoVisible = computed(() => graficaActiva.value?.ignoraRango !== true)

// La franja de KPIs: lo que hay que saber sin abrir ninguna gráfica.
const tarjetasKpi = computed(() => {
  if (!kpis.value) return []
  return [
    { etiqueta: 'Inversión en stock', valor: fmtPrecio(kpis.value.valorInventario), detalle: `${kpis.value.productos} productos`, icon: 'i-lucide-warehouse', color: 'text-primary' },
    { etiqueta: 'En el almacén', valor: fmtPrecio(kpis.value.valorAlmacen), detalle: `${fmtPrecio(kpis.value.valorQuiosco)} en quiosco`, icon: 'i-lucide-package', color: 'text-primary' },
    { etiqueta: 'Bajo mínimo', valor: kpis.value.bajoMinimo, detalle: kpis.value.bajoMinimo === 1 ? 'producto por reponer' : 'productos por reponer', icon: 'i-lucide-triangle-alert', color: kpis.value.bajoMinimo > 0 ? 'text-warning' : 'text-success' },
    { etiqueta: 'Merma del mes', valor: fmtPrecio(kpis.value.mermaMes), detalle: 'pérdida de mercancía', icon: 'i-lucide-trash-2', color: kpis.value.mermaMes > 0 ? 'text-error' : 'text-muted' },
    { etiqueta: 'Por cobrar', valor: fmtPrecio(kpis.value.cartera), detalle: 'deudas pendientes', icon: 'i-lucide-hand-coins', color: 'text-primary' }
  ]
})

function isoAHoy(d) {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Mueve el rango a los últimos N días: es lo que se mira casi siempre. */
function verUltimosDias(dias) {
  const hoy = new Date()
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (dias - 1))
  fechaDesde.value = isoAHoy(desde)
  fechaHasta.value = isoAHoy(hoy)
}

onMounted(async () => {
  // Rango por defecto: solo el día de hoy en los dos extremos. Es lo que se
  // mira casi siempre (el cuadre del día); el mes se elige a mano cuando hace
  // falta revisar una tendencia.
  verUltimosDias(1)

  await conexion.cargar().catch(() => {})

  const prods = await productoRepo.readAll({ query: { orderBy: 'nombre' } })
  const lista = Array.isArray(prods) ? prods : (prods?.data ?? [])
  productosParaSelector.value = lista.map(p => ({ label: p.nombre, value: p.id }))

  await cargarKpis()

  // La gráfica por defecto ya viene seleccionada: hay que pedirle sus datos
  // una vez montado el rango y el modo de conexión.
  if (graficaActiva.value) await cargarGrafica(graficaActiva.value)
})

async function cargarKpis() {
  try {
    kpis.value = await resumenNegocio()
  } catch {
    kpis.value = null
  }
}

async function cargarGrafica(g) {
  graficaActiva.value = g
  seccionActiva.value = g.seccion
  if (g.requiereProducto && !productoSeleccionado.value) {
    datosGrafica.value = []
    return
  }

  cargando.value = true
  try {
    datosGrafica.value = await calcularGrafica(g.key, {
      desde: fechaDesde.value ? fechaDesde.value.toString() : '',
      hasta: fechaHasta.value ? fechaHasta.value.toString() : '',
      agrupacion: agrupacion.value,
      productoId: productoSeleccionado.value
    })
    // La cobertura necesita más de un día para promediar: si el rango del
    // filtro no alcanza, se amplió solo y se dice aquí en vez de mentir.
    ventanaCoberturaActiva.value = g.key === 'dias-cobertura'
      ? ventanaDeCobertura({ desde: fechaDesde.value?.toString(), hasta: fechaHasta.value?.toString() })
      : null
  } catch {
    datosGrafica.value = []
  } finally {
    cargando.value = false
  }
}

const graficaSelect = computed({
  get: () => graficaActiva.value?.key ?? null,
  set: key => cargarDesdeSelect(key)
})

function cargarDesdeSelect(key) {
  const g = graficas.find(item => item.key === key)
  if (g) cargarGrafica(g)
}

/** Al cambiar de pestaña se abre la primera gráfica de esa sección. */
function cambiarSeccion(seccion) {
  seccionActiva.value = seccion
  const primera = graficas.find(g => g.seccion === seccion)
  if (primera && primera.key !== graficaActiva.value?.key) cargarGrafica(primera)
}

function getChartComponent(g) {
  const comp = COMPONENTES[g.componente] ?? BarChart
  return markRaw(comp)
}

function getChartConfig(g) {
  const horizontal = g.componente === 'bar-horizontal'
  const barra = (xKey, yKeys, labels, extra = {}) => ({
    xKey, yKeys, labels, horizontal, ...extra
  })
  const configs = {
    // Ganancia y caja
    'ganancia-por-periodo': barra('periodo', ['ganancia'], { periodo: 'Período', ganancia: 'Ganancia' }),
    'ganancia-real-fifo': barra('nombre', ['valor'], { nombre: 'Producto', valor: 'Ganancia real' }),
    'margen-porcentaje-producto': barra('nombre', ['valor'], { nombre: 'Producto', valor: 'Margen' }),
    'diferencia-estimada-real': barra('nombre', ['diferencia'], { nombre: 'Producto', diferencia: 'Diferencia' }),
    'ingresos-por-periodo': barra('periodo', ['ingresoTotal'], { periodo: 'Período', ingresoTotal: 'Ingreso total' }),
    'ingresos-fuera-de-cuadre': { xKey: 'periodo', yKeys: ['ingresoDirecto', 'gananciaDirecta'], labels: { periodo: 'Período', ingresoDirecto: 'Venta directa', gananciaDirecta: 'Ganancia directa' } },
    'regalos-descuentos-por-periodo': barra('periodo', ['valorRegalado', 'valorDescontado'], { periodo: 'Período', valorRegalado: 'Valor regalado', valorDescontado: 'Valor descontado' }),
    'faltantes-sobrantes-acumulados': barra('periodo', ['diferencia'], { periodo: 'Período', diferencia: 'Diferencia' }),
    'pagos-trabajadores': barra('trabajadorNombre', ['totalPagado'], { trabajadorNombre: 'Trabajador', totalPagado: 'Total pagado' }),
    'comparativa-por-trabajador': barra('trabajadorNombre', ['totalCuadres', 'diferenciaPromedio', 'cuadresConFaltante'], { trabajadorNombre: 'Trabajador', totalCuadres: 'Cuadres', diferenciaPromedio: 'Dif. promedio', cuadresConFaltante: 'Con faltante' }),

    // Inventario
    'dias-cobertura': barra('nombre', ['cobertura'], { nombre: 'Producto', cobertura: 'Días de stock' }),
    'estado-stock': { nameKey: 'estado', valueKey: 'cantidad', labels: { estado: 'Estado', cantidad: 'Productos' } },
    'valor-inventario-producto': barra('nombre', ['valorAlmacen', 'valorQuiosco'], { nombre: 'Producto', valorAlmacen: 'Almacén', valorQuiosco: 'Quiosco' }, { stacked: true }),
    'stock-almacen-vs-quiosco': barra('nombre', ['almacen', 'quiosco'], { nombre: 'Producto', almacen: 'Almacén', quiosco: 'Quiosco' }),
    'capital-dormido': barra('etiqueta', ['valor'], { etiqueta: 'Antigüedad', valor: 'Valor parado' }),
    'mermas-por-producto': barra('nombre', ['valor'], { nombre: 'Producto', valor: 'Valor perdido' }),
    'compras-vs-mermas': { xKey: 'periodo', yKeys: ['compras', 'mermas', 'devoluciones'], labels: { periodo: 'Período', compras: 'Compras', mermas: 'Mermas', devoluciones: 'Devoluciones' } },
    'traspasos-por-periodo': { xKey: 'periodo', yKeys: ['unidades', 'valor'], yAxisIndex: [0, 1], labels: { periodo: 'Período', unidades: 'Unidades', valor: 'Valor' } },
    'dias-sin-reponer': barra('nombre', ['dias'], { nombre: 'Producto', dias: 'Días sin mercadería' }),
    'cobertura-traspasos': { xKey: 'periodo', yKeys: ['repuesto', 'vendido'], labels: { periodo: 'Período', repuesto: 'Repuesto', vendido: 'Vendido' } },
    'inversion-acumulada': { xKey: 'periodo', yKeys: ['invertido', 'recuperado'], labels: { periodo: 'Período', invertido: 'Comprado', recuperado: 'Recuperado' } },
    'anulaciones-periodo': barra('periodo', ['valor'], { periodo: 'Período', valor: 'Valor revertido' }),
    'fifo-antiguedad-vendida': { xKey: 'periodo', yKeys: ['diasAntiguedad'], labels: { periodo: 'Período', diasAntiguedad: 'Días del lote' }, area: true },
    'evolucion-precio-compra': { xKey: 'periodo', yKeys: ['precioCompra', 'precioVenta'], labels: { periodo: 'Período', precioCompra: 'Precio de compra', precioVenta: 'Precio de venta' } },
    'gasto-por-proveedor': barra('proveedor', ['valor'], { proveedor: 'Proveedor', valor: 'Total comprado' }),
    'precio-medio-proveedor': barra('proveedor', ['precioMedio'], { proveedor: 'Proveedor', precioMedio: 'Precio medio' }),
    'heatmap-producto-dia': { xKey: 'periodo', yKey: 'nombre', valueKey: 'unidades', labels: { periodo: 'Período', nombre: 'Producto', unidades: 'Unidades' } },

    // Ventas
    'productos-mas-vendidos': barra('nombre', ['totalVendido'], { nombre: 'Producto', totalVendido: 'Cantidad vendida' }),
    'productos-mayor-ganancia': barra('nombre', ['gananciaTotal'], { nombre: 'Producto', gananciaTotal: 'Ganancia estimada' }),
    'productos-menor-rotacion': barra('nombre', ['totalVendido'], { nombre: 'Producto', totalVendido: 'Cantidad vendida' }),
    'evolucion-producto': { xKey: 'fecha', yKeys: ['cantidadVendida'], labels: { fecha: 'Fecha', cantidadVendida: 'Cantidad' } },
    'precio-usado-vs-oficial': { xKey: 'fecha', yKeys: ['precioVentaUsado', 'precioOficialActual'], labels: { fecha: 'Fecha', precioVentaUsado: 'Precio usado', precioOficialActual: 'Precio oficial' } },
    'proporcion-formas-pago': { nameKey: 'forma', valueKey: 'total', labels: { forma: 'Forma', total: 'Total' } },
    'estado-cuadres': barra('estado', ['cantidad'], { estado: 'Estado', cantidad: 'Cantidad' }),
    'cuadres-reabiertos': barra('fecha', ['reabiertoVeces'], { fecha: 'Fecha', reabiertoVeces: 'Reaperturas' }),

    // Deudas
    'deuda-por-cliente': barra('nombre', ['saldo'], { nombre: 'Cliente', saldo: 'Saldo pendiente' }),
    'antiguedad-cartera': { nameKey: 'forma', valueKey: 'saldo', labels: { forma: 'Antigüedad', saldo: 'Saldo' } },
    'cobrado-vs-fiado': { xKey: 'periodo', yKeys: ['fiado', 'cobrado'], labels: { periodo: 'Período', fiado: 'Fiado', cobrado: 'Cobrado' } }
  }
  return configs[g.key] || {}
}
</script>

<template>
  <div class="space-y-4">
    <UPageHeader
      title="Gráficas del negocio"
      description="Análisis de ventas, finanzas e inventario"
      leading-icon="i-lucide-bar-chart-2"
      class="pb-0"
    />

    <!-- Franja de KPIs: la respuesta rápida sin abrir ninguna gráfica -->
    <div
      v-if="tarjetasKpi.length"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
    >
      <UCard v-for="k in tarjetasKpi" :key="k.etiqueta">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs text-muted">
              {{ k.etiqueta }}
            </p>
            <p class="text-xl font-bold font-mono truncate">
              {{ k.valor }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ k.detalle }}
            </p>
          </div>
          <UIcon
            :name="k.icon"
            class="size-5 shrink-0"
            :class="k.color"
          />
        </div>
      </UCard>
    </div>

    <!-- Secciones: son 38 gráficas, una lista sola ya no ayuda a elegir -->
    <UTabs
      :model-value="seccionActiva"
      :items="SECCIONES"
      @update:model-value="cambiarSeccion"
    />

    <!-- Filtros globales -->
    <UCard class="bg-muted/30">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField
          v-if="rangoVisible"
          label="Desde"
          class="w-40"
        >
          <UInputDate v-model="fechaDesde" />
        </UFormField>
        <UFormField
          v-if="rangoVisible"
          label="Hasta"
          class="w-40"
        >
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
            value-key="value"
            label-key="label"
            :search-input="false"
            @update:model-value="graficaActiva && cargarGrafica(graficaActiva)"
          />
        </UFormField>
        <UFormField
          v-if="requiereProducto"
          label="Producto"
          class="w-56"
        >
          <USelectMenu
            v-model="productoSeleccionado"
            :items="productosParaSelector"
            value-key="value"
            label-key="label"
            placeholder="Seleccionar..."
            @update:model-value="graficaActiva && cargarGrafica(graficaActiva)"
          />
        </UFormField>
        <UButton
          v-if="rangoVisible"
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar-range"
          label="30 días"
          @click="verUltimosDias(30); graficaActiva && cargarGrafica(graficaActiva)"
        />
        <UButton
          v-if="graficaActiva"
          color="primary"
          icon="i-lucide-refresh-cw"
          label="Actualizar"
          :loading="cargando"
          @click="limpiarCacheGraficas(); cargarKpis(); cargarGrafica(graficaActiva)"
        />
      </div>
    </UCard>

    <!-- Selector compacto (móvil) -->
    <USelectMenu
      v-model="graficaSelect"
      :items="graficasDeSeccion.map(g => ({ label: g.titulo, value: g.key }))"
      value-key="value"
      label-key="label"
      :search-input="false"
      placeholder="Seleccionar gráfica..."
      class="lg:hidden w-full"
    />

    <!-- Grid de tarjetas de gráficas (desktop) -->
    <div
      class="hidden lg:grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
    >
      <UCard
        v-for="g in graficasDeSeccion"
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

      <!--
        La cobertura se amplía sola cuando el rango es de un solo día: decirlo
        es mejor que mostrar un promedio engañoso en silencio.
      -->
      <UAlert
        v-if="ventanaCoberturaActiva?.ampliada"
        icon="i-lucide-info"
        color="neutral"
        variant="soft"
        class="mb-3"
        :title="`Ventana de cálculo ampliada a ${ventanaCoberturaActiva.dias} días`"
        description="El rango del filtro no alcanza para promediar la venta diaria, así que se miraron los últimos días aunque no estén seleccionados."
      />

      <div v-if="cargando" class="flex items-center justify-center h-96">
        <UIcon name="i-lucide-loader" class="w-8 h-8 animate-spin" />
      </div>

      <div
        v-else-if="requiereProducto && !productoSeleccionado"
        class="flex flex-col items-center justify-center gap-2 h-96 text-muted"
      >
        <UIcon name="i-lucide-box-select" class="w-8 h-8" />
        <p>Selecciona un producto para ver esta gráfica</p>
      </div>

      <div
        v-else-if="datosGrafica.length === 0"
        class="flex flex-col items-center justify-center gap-3 h-96 text-muted"
      >
        <p>Sin datos para el período seleccionado</p>
        <!-- El rango arranca en hoy, y muchas gráficas de período quedan
             vacías con un solo día: la salida más rápida es Ampliar. -->
        <UButton
          v-if="rangoVisible"
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar-range"
          label="Ver últimos 30 días"
          @click="verUltimosDias(30); cargarGrafica(graficaActiva)"
        />
      </div>

      <div v-else class="h-96">
        <component
          :is="getChartComponent(graficaActiva)"
          :data="datosGrafica"
          :config="getChartConfig(graficaActiva)"
        />
      </div>
    </UCard>
  </div>
</template>
