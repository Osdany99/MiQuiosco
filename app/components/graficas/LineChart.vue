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

const option = computed(() => {
  const xKey = props.config.xKey
  const yKeys = props.config.yKeys || []
  const labels = props.config.labels || {}
  const coloresSerie = props.config.seriesColors || []
  const fechas = props.data.map(row => String(row[xKey] ?? ''))

  // Eje secundario: comparar cosas de distinta magnitud en la misma gráfica
  // (porcentaje acumulado sobre pesos). Solo se crea si alguna serie lo pide.
  const ejes = yKeys.map((_, i) => {
    const pedido = props.config.yAxisIndex
    if (Array.isArray(pedido)) return pedido[i] ?? 0
    return i === 0 ? pedido ?? 0 : 0
  })
  const hayEjeSecundario = ejes.some(e => e === 1)

  // Área con varias series se solapa en una mancha: solo si lo piden (o si son
  // apiladas, donde el área sí dice "total acumulado").
  const areaPorSerie = props.config.area
  const stacked = props.config.stacked === true
  const conArea = areaPorSerie === true || (yKeys.length === 1 && areaPorSerie !== false)

  const series = yKeys.map((key, i) => ({
    name: labels[key] || key,
    type: 'line',
    yAxisIndex: ejes[i],
    stack: stacked ? 'total' : undefined,
    data: props.data.map(row => Number(row[key]) || 0),
    smooth: true,
    symbol: 'circle',
    symbolSize: 7,
    showSymbol: props.data.length <= 40,
    lineStyle: { width: 3 },
    areaStyle: conArea ? { opacity: 0.1 } : undefined,
    itemStyle: Array.isArray(coloresSerie) ? { color: coloresSerie[i] } : undefined,
    emphasis: { focus: 'series' }
  }))

  const ejeValor = indice => ({
    type: 'value',
    minInterval: indice === 0 ? 1 : 0,
    ...(indice === 1 ? { position: 'right', splitLine: { show: false } } : {}),
    axisLabel: { formatter: v => fmtNumero(v) }
  })

  return {
    ...(props.config.colors ? { color: props.config.colors } : {}),
    tooltip: { trigger: 'axis', valueFormatter: v => fmtNumeroExacto(v) },
    legend: { show: yKeys.length > 1, top: 0 },
    grid: { left: 8, right: 16, top: yKeys.length > 1 ? 40 : 30, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: fechas,
      axisLabel: { rotate: fechas.length > 8 ? 32 : 0 }
    },
    yAxis: hayEjeSecundario ? [ejeValor(0), ejeValor(1)] : ejeValor(0),
    series
  }
})
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
