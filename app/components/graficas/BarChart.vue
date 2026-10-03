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

function truncar(texto, max = 16) {
  const t = String(texto ?? '')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const option = computed(() => {
  const xKey = props.config.xKey
  const yKeys = props.config.yKeys || []
  const labels = props.config.labels || {}
  const horizontal = props.config.horizontal === true
  // Apilado: para 누적ativos (capital por tramo de antigüedad, deuda por
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
    tooltip: {
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
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
