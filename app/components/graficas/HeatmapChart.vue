<script setup>
/**
 * HeatmapChart — producto × día/semana.
 *
 * Cada dato es una celda: `{ x: '2026-03-01', y: 'Pan', value: 12 }`. La celda
 * dice de un vistazo qué se vende los fines de semana y qué no se vende nunca,
 * cosa que una serie por producto esconde.
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

const colorMode = useColorMode()

const option = computed(() => {
  const xKey = props.config.xKey
  const yKey = props.config.yKey
  const valueKey = props.config.valueKey

  // Ejes en orden: los días en la X como vienen (los da el agrupador, ya
  // ordenados) y los productos de más venta a menos, para que arriba esté lo
  // que importa.
  const columnas = [...new Set(props.data.map(row => String(row[xKey] ?? '')))]
  const filas = [...new Set(props.data.map(row => String(row[yKey] ?? '')))]
    .sort((a, b) => {
      const suma = n => props.data
        .filter(r => String(r[yKey] ?? '') === n)
        .reduce((s, r) => s + (Number(r[valueKey]) || 0), 0)
      return suma(b) - suma(a)
    })

  const indiceX = new Map(columnas.map((v, i) => [v, i]))
  const indiceY = new Map(filas.map((v, i) => [v, i]))
  const celdas = props.data
    .map(row => [indiceX.get(String(row[xKey] ?? '')), indiceY.get(String(row[yKey] ?? '')), Number(row[valueKey]) || 0])
    .filter(([x, y]) => x !== undefined && y !== undefined)

  const maximo = Math.max(0, ...celdas.map(c => c[2]))
  const oscuro = colorMode.value === 'dark'

  return {
    tooltip: {
      trigger: 'item',
      formatter: p => `${filas[p.value[1]]}<br />${columnas[p.value[0]]}<br />${fmtNumeroExacto(p.value[2])}`
    },
    grid: { left: 8, right: 16, top: 16, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: columnas,
      splitArea: { show: true },
      axisLabel: { rotate: columnas.length > 8 ? 32 : 0, formatter: v => String(v).slice(5) }
    },
    yAxis: {
      type: 'category',
      data: filas,
      splitArea: { show: true },
      axisLabel: { width: 110, overflow: 'truncate' }
    },
    visualMap: {
      min: 0,
      max: maximo || 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 120,
      text: ['mucho', 'poco'],
      // En oscuro la rampa arranca en la superficie de la tarjeta, no en blanco.
      inRange: { color: oscuro ? ['#292524', '#00C16A'] : ['#f5f5f4', '#00C16A'] }
    },
    series: [
      {
        type: 'heatmap',
        data: celdas,
        label: { show: false },
        emphasis: { itemStyle: { borderColor: '#78716c', borderWidth: 1 } }
      }
    ]
  }
})
</script>

<template>
  <GChart :option="option" class="h-full w-full" />
</template>
