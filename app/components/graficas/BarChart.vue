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
  const categorias = props.data.map(row => String(row[xKey] ?? ''))

  const series = yKeys.map(key => ({
    name: labels[key] || key,
    type: 'bar',
    data: props.data.map(row => Number(row[key]) || 0),
    barMaxWidth: 56,
    label: {
      show: true,
      position: horizontal ? 'right' : 'top',
      formatter: p => fmtNumero(p.value),
      fontSize: 11
    },
    itemStyle: { borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] }
  }))

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
      valueFormatter: v => fmtNumero(v)
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
