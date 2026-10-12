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
 * Al tocar una barra se emite el período (`detalle`), no el evento de ECharts:
 * lo que interesa es la categoría, que es la clave del período ya agrupado.
 */
const emit = defineEmits(['detalle'])

function truncar(texto, max = 16) {
  const t = String(texto ?? '')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// El tooltip con botón solo se pinta donde la gráfica lo pide (config.detalle).
// Las demás siguen con el tooltip de ECharts y su valueFormatter.
const conDetalle = computed(() => props.config.detalle === true)
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
 * Mismo cuerpo que el tooltip por defecto (título + una línea por serie) más un
 * enlace al detalle del período. Va con estilos en línea porque el tooltip es un
 * div suelto de ECharts, fuera del árbol de la app donde viven las clases de
 * Tailwind.
 */
function tooltipConDetalle(params) {
  const lista = Array.isArray(params) ? params : [params]
  const oscuro = colorMode.value === 'dark'
  const periodo = lista[0]?.axisValue ?? ''
  const filas = lista
    .map(p => `${p.marker ?? ''} ${escapar(p.seriesName ?? '')}: ${fmtNumeroExacto(p.value)}`)
    .join('<br />')

  return [
    `<div style="font-weight:600">${escapar(truncar(periodo, 24))}</div>`,
    filas,
    `<a data-grafica-detalle="${escapar(periodo)}" style="display:inline-block;margin-top:8px;padding-top:6px;border-top:1px solid ${oscuro ? '#44403c' : '#e7e5e4'};color:${oscuro ? '#38bdf8' : '#0284c7'};cursor:pointer;font-weight:600;text-decoration:underline">Ver detalle</a>`
  ].join('')
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
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          // Sin esto el tooltip no acepta el puntero y el enlace no se puede tocar.
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
  emit('detalle', enlace.getAttribute('data-grafica-detalle'))
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
