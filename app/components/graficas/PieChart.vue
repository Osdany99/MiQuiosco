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

const nameKey = computed(() => props.config.nameKey)
const valueKey = computed(() => props.config.valueKey)
// const labels = computed(() => props.config.labels || {})
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

  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const radius = Math.min(centerX, centerY) - 40
  const innerRadius = radius * 0.5

  // Calculate total
  const total = props.data.reduce((sum, row) => sum + (Number(row[valueKey.value]) || 0), 0)
  if (total === 0) return

  let currentAngle = -Math.PI / 2

  props.data.forEach((row, i) => {
    const value = Number(row[valueKey.value]) || 0
    const sliceAngle = (value / total) * Math.PI * 2
    const color = colors.value[i % colors.value.length]

    // Draw slice
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    // Draw inner circle for donut
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    // Draw label
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

  // Draw center total
  ctx.fillStyle = '#1f2937'
  ctx.font = 'bold 16px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(fmtNumero(total), centerX, centerY - 4)
  ctx.font = '11px system-ui'
  ctx.fillStyle = '#6b7280'
  ctx.fillText('Total', centerX, centerY + 14)
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
