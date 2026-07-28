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

const nameKey = computed(() => props.config.nameKey)
const valueKey = computed(() => props.config.valueKey)
const colors = computed(() => props.config.colors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'])

const chartCanvas = ref(null)

const { initCanvas } = useCanvas(chartCanvas, props, drawChart)

function drawChart() {
  const setup = initCanvas()
  if (!setup) return
  const { ctx, rect } = setup

  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const radius = Math.min(centerX, centerY) - 40
  const innerRadius = radius * 0.5

  const total = props.data.reduce((sum, row) => sum + (Number(row[valueKey.value]) || 0), 0)
  if (total === 0) return

  let currentAngle = -Math.PI / 2

  props.data.forEach((row, i) => {
    const value = Number(row[valueKey.value]) || 0
    const sliceAngle = (value / total) * Math.PI * 2
    const color = colors.value[i % colors.value.length]

    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    const labelAngle = currentAngle + sliceAngle / 2
    const labelX = centerX + Math.cos(labelAngle) * (radius + 20)
    const labelY = centerY + Math.sin(labelAngle) * (radius + 20)
    const label = String(row[nameKey.value] || '')
    const percentage = ((value / total) * 100).toFixed(1)

    ctx.fillStyle = color
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = labelX > centerX ? 'left' : 'right'
    ctx.fillText(`${label}: ${percentage}%`, labelX, labelY)

    currentAngle += sliceAngle
  })

  ctx.fillStyle = '#1f2937'
  ctx.font = 'bold 16px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(fmtNumero(total), centerX, centerY - 4)
  ctx.font = '11px system-ui'
  ctx.fillStyle = '#6b7280'
  ctx.fillText('Total', centerX, centerY + 14)
}
</script>

<template>
  <div class="h-full w-full" style="min-height: 400px;">
    <canvas ref="chartCanvas" class="h-full w-full" />
  </div>
</template>
