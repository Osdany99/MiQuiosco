<script setup>
import { ref, computed } from 'vue'
import { useCanvas } from '~/composables/useCanvas'

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

const { initCanvas } = useCanvas(chartCanvas, props, drawChart)

function drawChart() {
  const setup = initCanvas()
  if (!setup) return
  const { ctx, rect } = setup

  const padding = { top: 30, right: 20, bottom: 50, left: 60 }
  const chartWidth = rect.width - padding.left - padding.right
  const chartHeight = rect.height - padding.top - padding.bottom

  const xKeyVal = xKey.value
  const yKeysVal = yKeys.value
  const colorsVal = colors.value

  let maxVal = 0
  props.data.forEach((row) => {
    yKeysVal.forEach((key) => {
      const val = Number(row[key]) || 0
      if (val > maxVal) maxVal = val
    })
  })

  if (maxVal === 0) maxVal = 1

  const barWidth = chartWidth / (props.data.length * yKeysVal.length + yKeysVal.length + 1)
  const groupWidth = barWidth * yKeysVal.length + barWidth

  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding.left, padding.top)
  ctx.lineTo(padding.left, padding.top + chartHeight)
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight)
  ctx.stroke()

  props.data.forEach((row, i) => {
    const groupX = padding.left + i * groupWidth + barWidth
    yKeysVal.forEach((key, j) => {
      const val = Number(row[key]) || 0
      const barHeight = (val / maxVal) * chartHeight
      const x = groupX + j * barWidth
      const y = padding.top + chartHeight - barHeight

      ctx.fillStyle = colorsVal[j % colorsVal.length]
      ctx.fillRect(x, y, barWidth * 0.8, barHeight)

      ctx.fillStyle = '#1f2937'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(String(val), x + barWidth * 0.4, y - 4)
    })

    ctx.fillStyle = '#6b7280'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(String(row[xKeyVal] || ''), groupX + groupWidth / 2, padding.top + chartHeight + 20)
  })

  for (let k = 0; k <= 5; k++) {
    const val = (maxVal / 5) * (5 - k)
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
</script>

<template>
  <div class="h-full w-full" style="min-height: 400px;">
    <canvas ref="chartCanvas" class="h-full w-full" />
  </div>
</template>
