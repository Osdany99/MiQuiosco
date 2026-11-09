<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

/**
 * Onda de voz animada (canvas). Varias capas senoidales suaves, como el modo
 * conversación de Claude.
 *
 *  - escuchando : la amplitud sigue el nivel del micrófono; al detectar voz
 *                 las capas se abren y se vuelven más brillantes.
 *  - hablando   : la amplitud sigue el pulso de la síntesis de voz.
 *  - procesando : onda baja con un destello que viaja de lado a lado.
 *  - error/idle : línea casi plana.
 */
const props = defineProps({
  modo: { type: String, default: 'idle' }, // idle | escuchando | hablando | procesando | error
  nivel: { type: Number, default: 0 }, // 0..1
  detectando: { type: Boolean, default: false },
  height: { type: Number, default: 64 }
})

const canvas = ref(null)
let ctx = null
let raf = null
let ancho = 0
let alto = 0
let fase = 0
let ultimo = 0
let amp = 0.05 // amplitud suavizada 0..1
let brillo = 0.5
let observer = null
let reducirMovimiento = false

// Paleta por modo: [color capa trasera, media, frontal]
const PALETAS = {
  escuchando: ['56, 189, 248', '16, 185, 129', '52, 211, 153'],
  hablando: ['167, 139, 250', '99, 102, 241', '129, 140, 248'],
  procesando: ['148, 163, 184', '100, 116, 139', '203, 213, 225'],
  error: ['248, 113, 113', '239, 68, 68', '252, 165, 165'],
  idle: ['148, 163, 184', '100, 116, 139', '148, 163, 184']
}

// Capas: frecuencia, velocidad, factor de amplitud, grosor, opacidad
const CAPAS = [
  { f: 1.2, v: 0.8, a: 0.55, g: 2, o: 0.35, d: 0 },
  { f: 1.9, v: -1.1, a: 0.75, g: 2, o: 0.55, d: 1.7 },
  { f: 2.6, v: 1.5, a: 1, g: 2.5, o: 1, d: 3.1 }
]

function ajustar() {
  const el = canvas.value
  if (!el) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  ancho = el.clientWidth
  alto = props.height
  el.width = Math.max(1, Math.floor(ancho * dpr))
  el.height = Math.max(1, Math.floor(alto * dpr))
  ctx = el.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Amplitud objetivo (0..1) según el modo. */
function objetivoAmp(t) {
  switch (props.modo) {
    case 'escuchando':
      // Respiración mínima + voz real.
      return 0.06 + Math.sin(t / 700) * 0.015 + props.nivel * 0.95
    case 'hablando':
      return 0.1 + Math.max(0, props.nivel) * 0.9 + (Math.sin(t / 130) + 1) * 0.04
    case 'procesando':
      return 0.14 + Math.sin(t / 380) * 0.04
    case 'error':
      return 0.02
    default:
      return 0.03
  }
}

function dibujar(t) {
  raf = requestAnimationFrame(dibujar)
  if (!ctx || !ancho) return
  const dt = Math.min(64, t - (ultimo || t))
  ultimo = t

  const meta = reducirMovimiento ? 0.08 : objetivoAmp(t)
  amp += (meta - amp) * (meta > amp ? 0.35 : 0.1)
  const metaBrillo = props.detectando || props.modo === 'hablando' ? 1 : 0.55
  brillo += (metaBrillo - brillo) * 0.08

  const velocidad = props.modo === 'procesando' ? 0.004 : 0.0025 + amp * 0.004
  if (!reducirMovimiento) fase += dt * velocidad

  ctx.clearRect(0, 0, ancho, alto)
  const medio = alto / 2
  const maxAmp = medio - 4
  const paleta = PALETAS[props.modo] || PALETAS.idle
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  CAPAS.forEach((c, i) => {
    const rgb = paleta[i]
    const grad = ctx.createLinearGradient(0, 0, ancho, 0)
    grad.addColorStop(0, `rgba(${rgb}, 0)`)
    grad.addColorStop(0.2, `rgba(${rgb}, ${c.o * brillo})`)
    grad.addColorStop(0.8, `rgba(${rgb}, ${c.o * brillo})`)
    grad.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.strokeStyle = grad
    ctx.lineWidth = c.g + (i === 2 ? amp * 1.5 : 0)
    if (i === 2) {
      ctx.shadowColor = `rgba(${rgb}, ${0.55 * brillo})`
      ctx.shadowBlur = 10 * brillo
    } else {
      ctx.shadowBlur = 0
    }

    ctx.beginPath()
    const paso = 3
    for (let x = 0; x <= ancho; x += paso) {
      const p = x / ancho
      // Envolvente: la onda se apaga hacia los bordes.
      const env = Math.pow(Math.sin(Math.PI * p), 1.6)
      let y = Math.sin(p * Math.PI * 2 * c.f + fase * c.v * 6 + c.d)
      // Segunda armónica para dar forma orgánica.
      y += 0.35 * Math.sin(p * Math.PI * 2 * c.f * 2.3 - fase * c.v * 4 + c.d)
      y = (y / 1.35) * env * maxAmp * amp * c.a
      if (x === 0) ctx.moveTo(x, medio + y)
      else ctx.lineTo(x, medio + y)
    }
    ctx.stroke()
  })
  ctx.shadowBlur = 0

  if (props.modo === 'procesando' && !reducirMovimiento) {
    // Destello que recorre la línea mientras se interpreta.
    const px = ((t / 1100) % 1) * ancho
    const g = ctx.createRadialGradient(px, medio, 0, px, medio, 46)
    g.addColorStop(0, 'rgba(226, 232, 240, 0.55)')
    g.addColorStop(1, 'rgba(226, 232, 240, 0)')
    ctx.fillStyle = g
    ctx.fillRect(px - 46, medio - 46, 92, 92)
  }
}

watch(() => props.height, ajustar)

onMounted(() => {
  try {
    reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { /* noop */ }
  ajustar()
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    observer = new ResizeObserver(ajustar)
    observer.observe(canvas.value)
  }
  raf = requestAnimationFrame(dibujar)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  observer?.disconnect()
})
</script>

<template>
  <canvas
    ref="canvas"
    class="block w-full"
    :style="{ height: `${height}px` }"
    aria-hidden="true"
  />
</template>
