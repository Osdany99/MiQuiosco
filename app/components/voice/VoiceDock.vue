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

const escuchando = computed(() => props.estado === 'escuchando')
const preparando = computed(() => props.estado === 'preparando')
const interpretando = computed(() => props.estado === 'interpretando')
// Solo se cancela cuando el micrófono ya está abierto: durante "preparando" un
// doble toque accidental no debe abortar el dictado que acaba de empezar.
const puedeCancelar = computed(() => escuchando.value)

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
  if (!props.disponible) return
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
  if (props.pushToTalk) return
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
        <UButton
          :icon="escuchando ? 'i-lucide-square' : 'i-lucide-mic'"
          :color="escuchando ? 'error' : 'primary'"
          :variant="escuchando ? 'solid' : 'soft'"
          size="sm"
          class="h-11 w-11 rounded-xl p-0 justify-center shadow-lg backdrop-blur pointer-events-none"
          :loading="preparando || interpretando"
          :disabled="!disponible"
          aria-hidden="true"
        />
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
</style>
