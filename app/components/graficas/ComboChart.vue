<script setup>
/**
 * ComboChart — barras + línea de acumulado con dos ejes.
 *
 * Existe para el Pareto ABC: las barras son la ganancia de cada producto (la
 * escala que importa son los pesos) y la línea es el porcentaje acumulado (que
 * vive en otra escala, 0-100). Meter las dos en el mismo eje haría la línea
 * invisible, así que aquí van en ejes separados.
 */
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
  const barKeys = props.config.barKeys || []
  const lineKeys = props.config.lineKeys || []
  const labels = props.config.labels || {}
  const categorias = props.data.map(row => String(row[xKey] ?? ''))
  const ambas = barKeys.length > 0 && lineKeys.length > 0

  const series = [
    ...barKeys.map(key => ({
      name: labels[key] || key,
      type: 'bar',
      yAxisIndex: 0,
      data: props.data.map(row => Number(row[key]) || 0),
      barMaxWidth: 56,
      label: {
        show: false,
        position: 'top',
        formatter: p => fmtNumero(p.value),
        fontSize: 11
      },
      itemStyle: { borderRadius: [6, 6, 0, 0] }
    })),
    ...lineKeys.map(key => ({
      name: labels[key] || key,
      type: 'line',
      yAxisIndex: 1,
      data: props.data.map(row => Number(row[key]) || 0),
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: props.data.length <= 40,
      lineStyle: { width: 3 },
      itemStyle: { color: '#f59e0b' }
    }))
  ]

  const ejeValor = {
    type: 'value',
    minInterval: 1,
    axisLabel: { formatter: v => fmtNumero(v) }
  }
  const ejePorcentaje = {
    type: 'value',
    min: 0,
    max: 100,
    position: 'right',
    splitLine: { show: false },
    axisLabel: { formatter: v => `${fmtNumero(v)}%` }
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: v => fmtNumeroExacto(v)
    },
    legend: { show: ambas, top: 0 },
    grid: { left: 8, right: 16, top: ambas ? 40 : 30, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: categorias,
      axisLabel: { rotate: categorias.length > 6 ? 28 : 0, formatter: v => truncar(v) }
    },
    yAxis: ambas ? [ejeValor, ejePorcentaje] : ejeValor,
    series
  }
})
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
