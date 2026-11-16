<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { derivarFaseVoz } from '../../utils/voice/faseVoz'

const props = defineProps({
  visible: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  estado: { type: String, default: 'idle' },
  error: { type: String, default: '' },
  transcript: { type: String, default: '' },
  // Conversación de confirmación (Modo PRO): el micrófono se abre fuera del
  // flujo normal, así que el layout avisa para no perder el panel.
  confirmando: { type: Boolean, default: false },
  // Fase real del STT: idle | preparando | capturando | procesando.
  faseStt: { type: String, default: 'idle' }
})

const emit = defineEmits(['reintentar', 'cancelar'])

const tts = useTts()
const voice = useVoiceCommand()
const { nivel, detectandoVoz, iniciar, detener } = useVoiceLevel()

const hablando = computed(() => Boolean(tts.hablando?.value))
// Micrófono realmente capturando. La fase la decide `useVoiceCommand`; así el
// churn `end`/`beginning` del motor offline no la mueve.
const micActivo = computed(() =>
  voice.estado.value === 'listening'
  && (props.faseStt === 'capturando' || Boolean(voice.microListo?.value))
)

// Una sola derivación para título, subtítulo y onda.
const fase = computed(() => derivarFaseVoz({
  estado: props.estado,
  vozEstado: voice.estado.value,
  faseStt: props.faseStt,
  hablando: hablando.value,
  confirmando: props.confirmando,
  cargandoModelo: Boolean(voice.cargandoModelo?.value),
  error: props.error || '',
  transcript: props.transcript || '',
  vozDetectada: detectandoVoz.value,
  textoReciente: Boolean(voice.textoReciente?.value)
}))

const esError = computed(() => fase.value.clave === 'error')
const puedeCancelar = computed(() => fase.value.puedeCancelar)
const modoOnda = computed(() => fase.value.modoOnda)
const vozDetectada = computed(() => fase.value.detectando)
// Es tu turno y todavía no has dicho nada: lo destacamos con fuerza.
const tuTurno = computed(() => fase.value.esperandoVoz)
const titulo = computed(() => fase.value.titulo)
const subtitulo = computed(() => fase.value.subtitulo)
const hayTranscript = computed(() => fase.value.transcriptEnSubtitulo)

// --- Nivel de la onda ------------------------------------------------------
// Al escuchar: nivel real del micrófono. Al hablar: pulso de la síntesis, que
// decae solo entre palabras.
const nivelHabla = ref(0)
let rafHabla = null

function decaer() {
  nivelHabla.value = Math.max(nivelHabla.value * 0.93, 0)
  const pulso = tts.pulsoHabla?.value || 0
  if (pulso > nivelHabla.value) nivelHabla.value = pulso
  if (tts.pulsoHabla) tts.pulsoHabla.value = 0
  rafHabla = requestAnimationFrame(decaer)
}

function arrancarDecaimiento() {
  if (!rafHabla) rafHabla = requestAnimationFrame(decaer)
}

function detenerDecaimiento() {
  if (rafHabla) cancelAnimationFrame(rafHabla)
  rafHabla = null
  nivelHabla.value = 0
}

watch(
  () => hablando.value || micActivo.value,
  v => (v ? arrancarDecaimiento() : detenerDecaimiento()),
  { immediate: true }
)

// Respaldo si el navegador no deja medir el micrófono: cada fragmento nuevo de
// texto reconocido empuja la onda, así siempre se nota que te está entendiendo.
watch(() => props.transcript, (nuevo, previo) => {
  if (micActivo.value && nuevo && nuevo !== previo) {
    nivelHabla.value = Math.max(nivelHabla.value, 0.55)
  }
})

// El micrófono solo se analiza mientras se está escuchando de verdad.
watch(
  () => micActivo.value && props.visible,
  (activo) => {
    if (activo) iniciar()
    else detener()
  },
  { immediate: true }
)

// Destello breve en el momento exacto en que el micrófono se abre.
const turnoReciente = ref(false)
let turnoTimer = null
watch(micActivo, (activo) => {
  if (!activo) return
  turnoReciente.value = true
  if (turnoTimer) clearTimeout(turnoTimer)
  turnoTimer = setTimeout(() => {
    turnoReciente.value = false
  }, 1100)
})

onBeforeUnmount(() => {
  if (turnoTimer) clearTimeout(turnoTimer)
  detener()
  if (rafHabla) cancelAnimationFrame(rafHabla)
})

const nivelOnda = computed(() => (hablando.value ? nivelHabla.value : Math.max(nivel.value, nivelHabla.value)))

const colorPunto = computed(() => {
  if (esError.value) return 'bg-error'
  if (hablando.value) return 'bg-violet-400'
  if (vozDetectada.value) return 'bg-emerald-400'
  if (fase.value.modoOnda === 'escuchando') return 'bg-sky-400'
  return 'bg-slate-400'
})
</script>

<template>
  <!-- Teleport a body: el layout es `fixed` y crea su propio contexto de apilamiento,
       así que dentro de él ningún z-index puede superar al diálogo (que vive en body). -->
  <Teleport to="body">
    <Transition name="voice-panel">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center px-3"
        :style="{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }"
      >
        <div
          class="voice-card pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl"
          :class="[
            esError
              ? 'border-error/40 bg-white/90 dark:bg-slate-900/90'
              : 'border-white/60 bg-white/80 dark:border-white/10 dark:bg-slate-900/80',
            vozDetectada && 'voice-card--activa',
            tuTurno && 'voice-card--turno',
            turnoReciente && 'voice-card--listo'
          ]"
          role="status"
          aria-live="polite"
        >
          <!-- Cabecera: estado + acción -->
          <div class="flex items-center gap-3 px-4 pt-3">
            <span class="relative flex size-2.5 shrink-0">
              <span
                v-if="!esError"
                class="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                :class="colorPunto"
              />
              <span class="relative inline-flex size-2.5 rounded-full" :class="colorPunto" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                {{ titulo }}
              </p>
            </div>

            <UButton
              v-if="esError"
              size="xs"
              color="error"
              variant="soft"
              icon="i-lucide-rotate-ccw"
              label="Reintentar"
              @click.stop="emit('reintentar')"
            />
            <UButton
              v-else-if="puedeCancelar"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="Cancelar dictado"
              @click.stop="emit('cancelar')"
            />
          </div>

          <!-- Onda -->
          <div class="px-2">
            <VoiceWave
              :modo="modoOnda"
              :nivel="nivelOnda"
              :detectando="vozDetectada"
              :height="68"
            />
          </div>

          <!-- Transcripción en vivo -->
          <div class="min-h-[2.75rem] px-5 pb-4">
            <Transition name="voice-texto" mode="out-in">
              <p
                v-if="subtitulo"
                :key="hayTranscript ? 'transcript' : subtitulo"
                class="line-clamp-2 text-center text-[0.95rem] leading-snug"
                :class="hayTranscript
                  ? 'font-medium text-slate-900 dark:text-white'
                  : esError
                    ? 'text-error'
                    : tuTurno
                      ? 'font-medium text-sky-600 dark:text-sky-300'
                      : 'text-slate-500 dark:text-slate-400'"
              >
                {{ subtitulo }}
              </p>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voice-card {
  transition: box-shadow 220ms ease, border-color 220ms ease;
}

/* Tu turno: el micrófono ya está abierto y esperando que hables. */
.voice-card--turno {
  border-color: rgb(56 189 248 / 0.7);
  animation: voice-turno 1.4s ease-in-out infinite;
}

/* Pequeño "pop" justo al abrirse el micrófono. */
.voice-card--listo {
  animation: voice-listo 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes voice-turno {
  0%,
  100% {
    box-shadow:
      0 20px 50px -12px rgb(0 0 0 / 0.35),
      0 0 0 1px rgb(56 189 248 / 0.25),
      0 0 18px -4px rgb(56 189 248 / 0.35);
  }
  50% {
    box-shadow:
      0 20px 50px -12px rgb(0 0 0 / 0.35),
      0 0 0 2px rgb(56 189 248 / 0.45),
      0 0 40px -2px rgb(56 189 248 / 0.6);
  }
}

@keyframes voice-listo {
  0% {
    transform: scale(0.97);
  }
  60% {
    transform: scale(1.025);
  }
  100% {
    transform: scale(1);
  }
}

/* Brillo suave cuando el micrófono detecta voz. */
.voice-card--activa {
  border-color: rgb(52 211 153 / 0.55);
  box-shadow:
    0 20px 50px -12px rgb(0 0 0 / 0.35),
    0 0 0 1px rgb(52 211 153 / 0.25),
    0 0 36px -6px rgb(52 211 153 / 0.45);
}

.voice-panel-enter-active,
.voice-panel-leave-active {
  transition: opacity 200ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.voice-panel-enter-from,
.voice-panel-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.97);
}

.voice-texto-enter-active,
.voice-texto-leave-active {
  transition: opacity 140ms ease;
}

.voice-texto-enter-from,
.voice-texto-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .voice-card--turno,
  .voice-card--listo {
    animation: none;
  }
  .voice-panel-enter-active,
  .voice-panel-leave-active {
    transition: opacity 120ms ease;
  }
  .voice-panel-enter-from,
  .voice-panel-leave-to {
    transform: none;
  }
}
</style>
