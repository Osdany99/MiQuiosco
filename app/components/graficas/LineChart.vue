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
  const fechas = props.data.map(row => String(row[xKey] ?? ''))

  const series = yKeys.map(key => ({
    name: labels[key] || key,
    type: 'line',
    data: props.data.map(row => Number(row[key]) || 0),
    smooth: true,
    symbol: 'circle',
    symbolSize: 7,
    showSymbol: props.data.length <= 40,
    lineStyle: { width: 3 },
    areaStyle: yKeys.length === 1 ? { opacity: 0.1 } : undefined,
    emphasis: { focus: 'series' }
  }))

  return {
    ...(props.config.colors ? { color: props.config.colors } : {}),
    tooltip: { trigger: 'axis', valueFormatter: v => fmtNumero(v) },
    legend: { show: yKeys.length > 1, top: 0 },
    grid: { left: 8, right: 16, top: yKeys.length > 1 ? 40 : 30, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: fechas,
      axisLabel: { rotate: fechas.length > 8 ? 32 : 0 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { formatter: v => fmtNumero(v) }
    },
    series
  }
})
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
