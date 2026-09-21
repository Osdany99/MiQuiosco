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

function pct(v) {
  return (Math.round(v * 10) / 10).toString()
}

const option = computed(() => {
  const nameKey = props.config.nameKey
  const valueKey = props.config.valueKey
  const items = props.data
    .map(row => ({ name: String(row[nameKey] ?? ''), value: Number(row[valueKey]) || 0 }))
    .filter(item => item.value > 0)
  const total = items.reduce((s, item) => s + item.value, 0)

  return {
    ...(props.config.colors ? { color: props.config.colors } : {}),
    tooltip: {
      trigger: 'item',
      formatter: p => `${p.marker} ${p.name}<br />${fmtNumero(p.value)} (${pct(p.percent)}%)`
    },
    legend: { bottom: 0, type: 'scroll' },
    title: {
      text: fmtNumero(total),
      subtext: 'Total',
      left: 'center',
      top: '38%',
      textAlign: 'center',
      itemGap: 2
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '46%'],
        padAngle: 2,
        itemStyle: { borderRadius: 8 },
        avoidLabelOverlap: true,
        label: { formatter: p => `${p.name}: ${pct(p.percent)}%` },
        labelLine: { length: 12, length2: 8 },
        emphasis: { scale: true, scaleSize: 4 },
        data: items
      }
    ]
  }
})
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
