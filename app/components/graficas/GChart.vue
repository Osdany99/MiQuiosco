<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart as EChartsBar, LineChart as EChartsLine, PieChart as EChartsPie, HeatmapChart as EChartsHeatmap } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  EChartsBar,
  EChartsLine,
  EChartsPie,
  EChartsHeatmap,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent
])

defineProps({
  option: {
    type: Object,
    required: true
  }
})

const FONT = ['Public Sans', 'system-ui', 'sans-serif'].join(', ')
const PALETTE = ['#00C16A', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function buildTheme(oscuro) {
  const text = oscuro ? '#d6d3d1' : '#57534e'
  const soft = oscuro ? '#a8a29e' : '#78716c'
  const line = oscuro ? '#44403c' : '#e7e5e4'
  return {
    color: PALETTE,
    backgroundColor: 'transparent',
    // Sin stroke en los textos: el textBorderColor blanco por defecto de
    // ECharts crea un halo visible sobre fondos oscuros (el canvas ignora
    // lineWidth 0, asi que hay que transparentar el color).
    textStyle: { fontFamily: FONT, color: text, textBorderColor: 'transparent' },
    title: {
      textStyle: { fontFamily: FONT, color: oscuro ? '#fafaf9' : '#1c1917' },
      subtextStyle: { fontFamily: FONT, color: soft }
    },
    line: { lineStyle: { width: 3 }, symbol: 'circle', symbolSize: 8, smooth: true },
    categoryAxis: {
      axisLine: { show: true, lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: soft },
      splitLine: { show: false }
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: soft },
      splitLine: { show: true, lineStyle: { color: line, type: 'dashed' } }
    },
    tooltip: {
      backgroundColor: oscuro ? '#1c1917' : '#ffffff',
      borderColor: line,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { fontFamily: FONT, color: oscuro ? '#f5f5f4' : '#1c1917', fontSize: 12 },
      axisPointer: {
        lineStyle: { color: soft },
        crossStyle: { color: soft },
        shadowStyle: { color: oscuro ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
        label: { backgroundColor: oscuro ? '#44403c' : '#78716c' }
      }
    },
    legend: { textStyle: { fontFamily: FONT, color: text } }
  }
}

const themeLight = buildTheme(false)
const themeDark = buildTheme(true)

const colorMode = useColorMode()
const theme = computed(() => (colorMode.value === 'dark' ? themeDark : themeLight))
</script>

<template>
  <VChart
    :option="option"
    :theme="theme"
    autoresize
    class="h-full w-full"
  />
</template>
