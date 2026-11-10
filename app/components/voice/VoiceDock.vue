<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  disponible: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  estado: { type: String, default: 'idle' },
  motivo: { type: String, default: null },
  error: { type: String, default: null },
  pushToTalk: { type: Boolean, default: false }
})

const emit = defineEmits(['activar', 'cancelar', 'detener'])

const { nivel, detectandoVoz } = useVoiceLevel()
const tts = useTts()
const toast = useToast()

// Feedback al tocar el dock desactivado: antes no pasaba nada y no había forma
// de saber por qué la voz no estaba disponible.
const MS_ENTRE_AVISOS = 2500
let ultimoAviso = 0

function avisarNoDisponible() {
  const motivo = props.motivo
  if (!motivo || motivo === 'Cargando…') return
  const ahora = Date.now()
  if (ahora - ultimoAviso < MS_ENTRE_AVISOS) return
  ultimoAviso = ahora
  toast.add({
    title: 'Voz no disponible',
    description: motivo,
    color: 'warning',
    icon: 'i-lucide-mic-off'
  })
}

const hablando = computed(() => Boolean(tts.hablando?.value))
const escuchando = computed(() => props.estado === 'escuchando')
const preparando = computed(() => props.estado === 'preparando')
const interpretando = computed(() => props.estado === 'interpretando')
// Solo se cancela cuando el micrófono ya está abierto: durante "preparando" un
// doble toque accidental no debe abortar el dictado que acaba de empezar.
const puedeCancelar = computed(() => escuchando.value)

const esError = computed(() => props.estado === 'error')
const trabajando = computed(() => preparando.value || interpretando.value)
const vozDetectada = computed(() => escuchando.value && detectandoVoz.value)
const icono = computed(() => {
  if (esError.value) return 'i-lucide-mic-off'
  if (hablando.value) return 'i-lucide-audio-lines'
  if (escuchando.value) return 'i-lucide-square'
  if (trabajando.value) return 'i-lucide-loader-circle'
  return 'i-lucide-mic'
})
// Tamaño de los anillos según el volumen real (solo mientras escucha).
const escalaAnillo = computed(() => (escuchando.value ? 1 + nivel.value * 0.9 : 1))

const dockRef = ref(null)
const x = ref(0)
const y = ref(0)
const isDragging = ref(false)
const moved = ref(false)

const etiquetaTooltip = computed(() => {
  if (props.pushToTalk) {
    if (preparando.value) return 'Preparando micrófono…'
    if (escuchando.value) return 'Suelta para enviar'
    if (interpretando.value) return 'Interpretando…'
    if (props.estado === 'ambiguo') return 'Elegir producto'
    if (props.estado === 'listo') return 'Listo para confirmar'
    if (props.estado === 'error') return `${props.error || 'No te entendí.'} Toca para reintentar.`
    if (!props.disponible && props.motivo) return `Voz no disponible: ${props.motivo}`
    return 'Mantén pulsado para hablar (arrastra para mover)'
  }
  if (preparando.value) return 'Preparando micrófono…'
  if (escuchando.value) return 'Escuchando… (toca para detener)'
  if (interpretando.value) return 'Interpretando…'
  if (props.estado === 'ambiguo') return 'Elegir producto'
  if (props.estado === 'listo') return 'Listo para confirmar'
  if (props.estado === 'error') return `${props.error || 'No te entendí.'} Toca para reintentar.`
  if (!props.disponible && props.motivo) return `Voz no disponible: ${props.motivo}`
  return 'Iniciar dictado por voz (arrastra para mover)'
})

// --- Persistencia de posición ---------------------------------------------
const PREF_KEY = 'voice.dock.position'
const MARGIN = 12
const THRESHOLD = 6

async function loadPosition() {
  if (!import.meta.client) return null
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const { value } = await Preferences.get({ key: PREF_KEY })
    if (value) return JSON.parse(value)
  } catch { /* noop */ }
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return null
}

async function savePosition() {
  if (!import.meta.client) return
  const payload = JSON.stringify({ x: x.value, y: y.value })
  try {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: PREF_KEY, value: payload })
  } catch { /* noop */ }
  try {
    localStorage.setItem(PREF_KEY, payload)
  } catch {
    /* noop */
  }
}

// --- Geometría y clamping --------------------------------------------------
function bounds() {
  const el = dockRef.value
  const w = el?.offsetWidth || 48
  const h = el?.offsetHeight || 48
  return {
    w,
    h,
    maxX: window.innerWidth - w - MARGIN,
    maxY: window.innerHeight - h - MARGIN
  }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

function clampPosition() {
  if (!import.meta.client) return
  const { maxX, maxY } = bounds()
  x.value = clamp(x.value, MARGIN, maxX)
  y.value = clamp(y.value, MARGIN, maxY)
}

function defaultPosition() {
  if (!import.meta.client) return
  const { w, h, maxX, maxY } = bounds()
  x.value = clamp(window.innerWidth - w - 24, MARGIN, maxX)
  y.value = clamp(window.innerHeight - h - 16, MARGIN, maxY)
}

// --- Ciclo de vida ---------------------------------------------------------
onMounted(async () => {
  await nextTick()
  const saved = await loadPosition()
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    x.value = saved.x
    y.value = saved.y
    clampPosition()
  } else {
    defaultPosition()
  }
  window.addEventListener('resize', clampPosition)
})

onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('resize', clampPosition)
})

// --- Arrastre + push-to-talk ----------------------------------------------
let dragStart = null
let presionTimer = null
let presionando = false

function limpiarPresion() {
  if (presionTimer) {
    clearTimeout(presionTimer)
    presionTimer = null
  }
}

function onPointerDown(e) {
  if (!import.meta.client) return
  if (e.button && e.button !== 0) return
  isDragging.value = true
  moved.value = false
  presionando = false
  dragStart = {
    px: e.clientX,
    py: e.clientY,
    ox: x.value,
    oy: y.value
  }
  try {
    e.currentTarget?.setPointerCapture?.(e.pointerId)
  } catch {
    /* noop */
  }

  // Modo push-to-talk: se arranca tras mantener pulsado sin arrastrar.
  if (props.pushToTalk && props.disponible && !props.ocupado) {
    presionTimer = setTimeout(() => {
      if (!isDragging.value || moved.value) return
      presionando = true
      emit('activar')
    }, 120)
  }
}

function onPointerMove(e) {
  if (!isDragging.value || !dragStart) return
  const dx = e.clientX - dragStart.px
  const dy = e.clientY - dragStart.py
  if (!moved.value && Math.hypot(dx, dy) >= THRESHOLD) {
    // Si empezó el micrófono y el usuario arrastra, se cancela (no envía).
    moved.value = true
    limpiarPresion()
    if (presionando) {
      presionando = false
      emit('cancelar')
    }
  }
  if (moved.value) {
    const { maxX, maxY } = bounds()
    x.value = clamp(dragStart.ox + dx, MARGIN, maxX)
    y.value = clamp(dragStart.oy + dy, MARGIN, maxY)
  }
}

async function onPointerUp(e) {
  if (!isDragging.value) return
  isDragging.value = false
  limpiarPresion()
  dragStart = null
  try {
    e.currentTarget?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* noop */
  }
  if (presionando) {
    presionando = false
    emit('detener')
  } else if (props.pushToTalk && (props.estado === 'escuchando' || props.estado === 'preparando') && !moved.value) {
    emit('detener')
  }
  if (moved.value) {
    await savePosition()
    setTimeout(() => {
      moved.value = false
    }, 50)
  }
}

/** Acción de toque/teclado: en push-to-talk alternar; en modo tap, cancelar o activar. */
function accion() {
  if (!props.disponible) {
    avisarNoDisponible()
    return
  }
  if (props.pushToTalk) {
    if (props.ocupado) emit('detener')
    else emit('activar')
    return
  }
  if (puedeCancelar.value) {
    emit('cancelar')
    return
  }
  if (props.ocupado) return
  emit('activar')
}

function onClick(e) {
  if (moved.value) {
    moved.value = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (props.pushToTalk) {
    if (!props.disponible) avisarNoDisponible()
    return
  }
  accion()
}

function onKeyDown(e) {
  let dx = 0
  let dy = 0
  if (e.key === 'ArrowLeft') dx = -20
  else if (e.key === 'ArrowRight') dx = 20
  else if (e.key === 'ArrowUp') dy = -20
  else if (e.key === 'ArrowDown') dy = 20
  else if (e.key === 'Enter' || e.key === ' ') {
    if (e.repeat) return
    e.preventDefault()
    accion()
    return
  } else return
  e.preventDefault()
  const { maxX, maxY } = bounds()
  x.value = clamp(x.value + dx, MARGIN, maxX)
  y.value = clamp(y.value + dy, MARGIN, maxY)
  void savePosition()
}

const rootStyle = computed(() => ({
  transform: `translate3d(${x.value}px, ${y.value}px, 0)`
}))
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="fixed inset-0 z-[60] pointer-events-none">
      <div
        ref="dockRef"
        class="pointer-events-auto absolute left-0 top-0 touch-none select-none outline-none"
        :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
        :style="rootStyle"
        tabindex="0"
        role="button"
        :aria-label="etiquetaTooltip"
        :title="etiquetaTooltip"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click="onClick"
        @keydown="onKeyDown"
      >
        <div
          class="voice-fab relative grid size-12 place-items-center"
          :class="{
            'voice-fab--escuchando': escuchando,
            'voice-fab--voz': vozDetectada,
            'voice-fab--hablando': hablando,
            'voice-fab--trabajando': trabajando && !hablando,
            'voice-fab--error': esError,
            'voice-fab--off': !disponible
          }"
          :style="{ '--escala': escalaAnillo }"
        >
          <!-- Anillos: reaccionan al volumen al escuchar, laten al hablar. -->
          <span class="voice-ring voice-ring--a" aria-hidden="true" />
          <span class="voice-ring voice-ring--b" aria-hidden="true" />

          <span class="voice-core pointer-events-none relative grid size-12 place-items-center rounded-full text-white">
            <UIcon
              :name="icono"
              class="size-5"
              :class="trabajando && !hablando ? 'animate-spin' : ''"
            />
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* --- Botón ---------------------------------------------------------------- */
.voice-core {
  background: linear-gradient(135deg, #34d399 0%, #10b981 55%, #059669 100%);
  box-shadow:
    0 8px 20px -6px rgb(16 185 129 / 0.55),
    inset 0 1px 0 rgb(255 255 255 / 0.35);
  transition: background 240ms ease, box-shadow 240ms ease, transform 160ms ease;
}

.voice-fab:active .voice-core {
  transform: scale(0.94);
}

.voice-fab--escuchando .voice-core {
  background: linear-gradient(135deg, #38bdf8 0%, #10b981 100%);
  box-shadow:
    0 8px 24px -6px rgb(56 189 248 / 0.6),
    inset 0 1px 0 rgb(255 255 255 / 0.4);
}

.voice-fab--voz .voice-core {
  box-shadow:
    0 0 0 3px rgb(52 211 153 / 0.35),
    0 8px 26px -4px rgb(52 211 153 / 0.75),
    inset 0 1px 0 rgb(255 255 255 / 0.4);
}

.voice-fab--hablando .voice-core {
  background: linear-gradient(135deg, #a78bfa 0%, #6366f1 100%);
  box-shadow:
    0 8px 24px -6px rgb(129 140 248 / 0.65),
    inset 0 1px 0 rgb(255 255 255 / 0.4);
}

.voice-fab--trabajando .voice-core {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  box-shadow: 0 8px 20px -8px rgb(100 116 139 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.3);
}

.voice-fab--error .voice-core {
  background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
  box-shadow: 0 8px 22px -6px rgb(239 68 68 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.35);
}

.voice-fab--off {
  opacity: 0.5;
  filter: grayscale(0.6);
}

/* --- Anillos -------------------------------------------------------------- */
.voice-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid transparent;
  opacity: 0;
  pointer-events: none;
}

/* Escuchando: el tamaño sigue la voz (--escala llega del nivel real). */
.voice-fab--escuchando .voice-ring {
  border-color: rgb(52 211 153 / 0.55);
  opacity: 1;
  transition: transform 90ms linear, opacity 200ms ease;
}
.voice-fab--escuchando .voice-ring--a {
  transform: scale(calc(1 + (var(--escala) - 1) * 0.55));
}
.voice-fab--escuchando .voice-ring--b {
  border-color: rgb(56 189 248 / 0.4);
  transform: scale(calc(1.1 + (var(--escala) - 1) * 1.1));
}

/* Hablando: latido propio, la síntesis no expone audio. */
.voice-fab--hablando .voice-ring {
  border-color: rgb(129 140 248 / 0.55);
  animation: voice-latido 1.3s ease-out infinite;
}
.voice-fab--hablando .voice-ring--b {
  animation-delay: 0.45s;
}

@keyframes voice-latido {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.85);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-fab--hablando .voice-ring {
    animation: none;
    opacity: 0.5;
  }
  .voice-fab--escuchando .voice-ring {
    transition: none;
  }
}
</style>
