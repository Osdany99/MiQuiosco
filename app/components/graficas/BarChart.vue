<script setup>
import { computed } from 'vue'
import GChart from './GChart.vue'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  config: {
    type: Object,
    required: true
  }
})

/**
 * Al tocar "Ver detalle" se emite `{ periodo, tipo }`, no el evento de ECharts:
 * la categoría es la clave del período ya agrupado y `tipo` es el desglose que
 * declaró la gráfica para esa serie.
 */
const emit = defineEmits(['detalle'])

function truncar(texto, max = 16) {
  const t = String(texto ?? '')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// El tooltip con botón solo se pinta donde la gráfica lo pide (config.detalle).
// Las demás siguen con el tooltip de ECharts y su valueFormatter.
const conDetalle = computed(() => !!props.config.detalle)
const colorMode = useColorMode()

/** El tooltip se escribe como HTML: sin escapar, un nombre con '<' lo rompe. */
function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Qué clave de `yKeys` es la serie del renglón. Se busca por índice y, si
 * ECharts no lo manda, por nombre visible: así el enlace no depende de un solo
 * campo del evento.
 */
function claveSerie(p) {
  const yKeys = props.config.yKeys || []
  const idx = Number(p?.seriesIndex)
  if (Number.isInteger(idx) && yKeys[idx]) return yKeys[idx]
  const nombre = p?.seriesName
  return Object.entries(props.config.labels || {}).find(([, visible]) => visible === nombre)?.[0] ?? ''
}

/**
 * Qué desglose abre esa serie. La gráfica lo declara en la config
 * (`detalle: { gananciaCuadre: 'cuadre', gananciaDirecta: 'fuera' }`); si solo
 * dice `detalle: true`, se manda la clave y el consumidor decide.
 */
function tipoDeSerie(clave) {
  const mapa = props.config.detalle
  return typeof mapa === 'object' && mapa ? (mapa[clave] ?? '') : clave
}

/**
 * Un renglón por serie con SU "Ver detalle". Va con `trigger: 'axis'` a
 * propósito: así el enlace existe aunque esa serie valga 0 ese día (una barra
 * sin altura no se puede tocar) y no hay que adivinar qué barra se abrió.
 * Los estilos van en línea porque el tooltip es un div suelto de ECharts,
 * fuera del árbol de la app donde viven las clases de Tailwind.
 */
function tooltipConDetalle(params) {
  const lista = Array.isArray(params) ? params : [params]
  const oscuro = colorMode.value === 'dark'
  // `axisValue` y no `axisValueLabel`: el segundo trae la etiqueta ya recortada
  // por el formatter del eje, y el enlace necesita la clave completa.
  const periodo = lista[0]?.axisValue ?? lista[0]?.name ?? ''
  const titulo = lista[0]?.axisValueLabel ?? periodo
  const colorEnlace = oscuro ? '#38bdf8' : '#0284c7'

  const filas = lista.map((p) => {
    const clave = claveSerie(p)
    const tipo = tipoDeSerie(clave)
    return [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">',
      `<span>${p?.marker ?? ''} ${escapar(p?.seriesName ?? '')}: ${fmtNumeroExacto(p?.value)}</span>`,
      `<a data-grafica-detalle="${escapar(periodo)}" data-grafica-tipo="${escapar(tipo)}" style="color:${colorEnlace};cursor:pointer;font-weight:600;text-decoration:underline">Ver detalle</a>`,
      '</div>'
    ].join('')
  }).join('')

  return `<div style="font-weight:600;margin-bottom:4px">${escapar(truncar(titulo, 24))}</div>${filas}`
}

const option = computed(() => {
  const xKey = props.config.xKey
  const yKeys = props.config.yKeys || []
  const labels = props.config.labels || {}
  const horizontal = props.config.horizontal === true
  // Apilado: para acumulados (capital por tramo de antigüedad, deuda por
  // cliente). El valor de cada serie se lee dentro del segmento, no encima.
  const stacked = props.config.stacked === true
  const ocultarEtiquetas = props.config.ocultarEtiquetas === true
  const coloresSerie = props.config.seriesColors || []
  const categorias = props.data.map(row => String(row[xKey] ?? ''))

  const series = yKeys.map((key, i) => {
    const color = Array.isArray(coloresSerie) ? coloresSerie[i] : coloresSerie
    return {
      name: labels[key] || key,
      type: 'bar',
      stack: stacked ? 'total' : undefined,
      data: props.data.map(row => Number(row[key]) || 0),
      barMaxWidth: 56,
      label: {
        show: !ocultarEtiquetas,
        position: stacked ? 'inside' : (horizontal ? 'right' : 'top'),
        formatter: p => fmtNumero(p.value),
        fontSize: 11
      },
      itemStyle: {
        color,
        // Apiladas, las esquinas redondeadas se notarían en cada segmento.
        borderRadius: stacked ? 0 : (horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0])
      }
    }
  })

  const ejeCategorias = {
    type: 'category',
    data: categorias,
    axisLabel: horizontal
      ? { width: 150, overflow: 'truncate' }
      : { rotate: categorias.length > 6 ? 28 : 0, formatter: v => truncar(v) }
  }
  const ejeValores = {
    type: 'value',
    minInterval: 1,
    axisLabel: { formatter: v => fmtNumero(v) }
  }

  return {
    ...(props.config.colors ? { color: props.config.colors } : {}),
    tooltip: conDetalle.value
      ? {
          // Por eje: el tooltip lista las series del período y cada renglón
          // tiene su enlace. Con 'item' solo se podía abrir la barra que tenía
          // altura, así que una serie en 0 quedaba inaccesible.
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          // Sin esto el tooltip no acepta el puntero y los enlaces no se pueden tocar.
          enterable: true,
          formatter: tooltipConDetalle
        }
      : {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          // Exacto en el tooltip, abreviado en el eje y en la etiqueta: en el
          // tooltip la persona quiere el número, no su magnitud.
          valueFormatter: v => fmtNumeroExacto(v)
        },
    legend: { show: yKeys.length > 1, top: 0 },
    grid: { left: 8, right: 16, top: yKeys.length > 1 ? 40 : 30, bottom: 0, containLabel: true },
    xAxis: horizontal ? ejeValores : ejeCategorias,
    yAxis: horizontal ? ejeCategorias : ejeValores,
    series
  }
})

/**
 * El tooltip lo reconstruye ECharts en cada movimiento del ratón, así que no
 * se puede colgar un manejador al enlace: se escucha el clic en el contenedor
 * (el tooltip vive dentro de él) y se busca el enlace por atributo.
 */
function alTocar(e) {
  const enlace = e.target?.closest?.('[data-grafica-detalle]')
  if (!enlace) return
  emit('detalle', {
    periodo: enlace.getAttribute('data-grafica-detalle') ?? '',
    tipo: enlace.getAttribute('data-grafica-tipo') ?? ''
  })
}
</script>

<template>
  <div
    class="h-full w-full"
    @click="alTocar"
  >
    <GChart :option="option" class="h-full w-full" />
  </div>
</template>
