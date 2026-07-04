<script setup>
import { onMounted, ref, watch, computed } from 'vue'

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

const xKey = computed(() => props.config.xKey)
const yKeys = computed(() => props.config.yKeys)
const labels = computed(() => props.config.labels || {})
const colors = computed(() => props.config.colors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'])

const chartCanvas = ref(null)

function drawChart() {
  if (!chartCanvas.value || !props.data.length) return

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  const canvas = chartCanvas.value
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, rect.width, rect.height)

  const padding = { top: 30, right: 20, bottom: 50, left: 60 }
  const chartWidth = rect.width - padding.left - padding.right
  const chartHeight = rect.height - padding.top - padding.bottom

  const xKeyVal = xKey.value
  const yKeysVal = yKeys.value
  const colorsVal = colors.value

  // Find min/max for Y axis
  let minVal = Infinity
  let maxVal = -Infinity
  props.data.forEach((row) => {
    yKeysVal.forEach((key) => {
      const val = Number(row[key]) || 0
      if (val < minVal) minVal = val
      if (val > maxVal) maxVal = val
    })
  })
  if (minVal === Infinity) minVal = 0
  if (maxVal === -Infinity) maxVal = 1
  if (minVal === maxVal) maxVal = minVal + 1

  const xStep = chartWidth / Math.max(1, props.data.length - 1)

  // Draw axes
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, padding.top + chartHeight)
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
  ctx.stroke()

  // Draw grid lines and Y labels
  for (let k = 0; k <= 5; k++) {
    const val = minVal + (maxVal - minVal) * (5 - k) / 5
    const y = padding.top + (chartHeight / 5) * k
    ctx.fillStyle = '#9ca3af'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText(fmtNumero(val), padding.left - 8, y + 4)

    ctx.strokeStyle = '#f3f4f6'
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + chartWidth, y)
    ctx.stroke()
  }

  // Draw lines for each yKey
  yKeysVal.forEach((key, j) => {
    const color = colorsVal[j % colorsVal.length]
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    props.data.forEach((row, i) => {
      const val = Number(row[key]) || 0
      const x = padding.left + i * xStep
      const y = padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Draw points
    ctx.fillStyle = color
    props.data.forEach((row, i) => {
      const val = Number(row[key]) || 0
      const x = padding.left + i * xStep
      const y = padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    })
  })

  // Draw X axis labels
  ctx.fillStyle = '#6b7280'
  ctx.font = '11px system-ui'
  ctx.textAlign = 'center'
  props.data.forEach((row, i) => {
    const x = padding.left + i * xStep
    ctx.fillText(String(row[xKeyVal] || ''), x, padding.top + chartHeight + 20)
  })

  // Legend
  if (yKeysVal.length > 1) {
    yKeysVal.forEach((key, j) => {
      const label = labels.value[key] || key
      const x = padding.left + j * 120
      const y = padding.top - 20
      ctx.fillStyle = colorsVal[j % colorsVal.length]
      ctx.fillRect(x, y, 12, 12)
      ctx.fillStyle = '#374151'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(label, x + 16, y + 10)
    })
  }
}

function fmtNumero(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K'
  return v.toFixed(0)
}

onMounted(() => {
  drawChart()
})

watch(() => props.data, drawChart, { deep: true })
watch(() => props.config, drawChart, { deep: true })
</script>

<template>
  <div class="h-full w-full" style="min-height: 400px;">
    <canvas ref="chartCanvas" class="h-full w-full" />
  </div>
</template>
