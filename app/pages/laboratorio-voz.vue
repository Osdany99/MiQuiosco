<script setup>
import {
  FRASES_PILOTO,
  VoskPilot,
  evaluarTranscripcion,
  formatearInforme
} from '../utils/voice/voskPilot'

// Piloto aislado: no toca comandos, dock, ventas ni base de datos.
const KEY_SESION = 'voz.piloto.sesion'

const toast = useToast()
const preparando = ref(false)
const listo = ref(false)
const faseModelo = ref('')
const progresoModelo = ref(0)
const errorModelo = ref('')
const grabando = ref(false)
const parcial = ref('')
const resultado = ref(null)
const valoracion = ref('')
const fraseId = ref(FRASES_PILOTO[0].id)
const sesion = ref([])

let escucha = null

const fraseActual = computed(() =>
  FRASES_PILOTO.find(f => f.id === fraseId.value) || FRASES_PILOTO[0]
)
const frasesSelect = FRASES_PILOTO.map(f => ({
  label: `${f.texto} — ${f.nota}`,
  value: f.id
}))
const evaluacion = computed(() =>
  resultado.value ? evaluarTranscripcion(fraseActual.value.texto, resultado.value.text) : null
)
const resumen = computed(() => {
  const total = sesion.value.length
  const ok = sesion.value.filter(t => evaluarTranscripcion(t.esperado, t.texto).ok).length
  const decode = total
    ? sesion.value.reduce((s, t) => s + (Number(t.msDecode) || 0), 0) / total / 1000
    : 0
  return { total, ok, porcentaje: total ? Math.round(ok * 100 / total) : 0, decode }
})

onMounted(async () => {
  try {
    const guardada = localStorage.getItem(KEY_SESION)
    if (guardada) sesion.value = JSON.parse(guardada)
  } catch {
    sesion.value = []
  }

  try {
    escucha = await VoskPilot.addListener('pilotEvent', (evento = {}) => {
      if (evento.event === 'preparar') {
        faseModelo.value = evento.fase === 'descomprimiendo' ? 'Descomprimiendo modelo' : 'Preparando modelo'
        progresoModelo.value = Number(evento.progreso) || 0
      } else if (evento.event === 'carga') {
        faseModelo.value = 'Cargando modelo'
      } else if (evento.event === 'partial') {
        parcial.value = evento.texto || ''
      }
    })
  } catch {
    /* sin listener: la UI sigue funcionando */
  }

  void preparar()
})

onUnmounted(() => {
  try {
    escucha?.remove()
  } catch {
    /* noop */
  }
  VoskPilot.cancel().catch(() => {})
  VoskPilot.liberar().catch(() => {})
})

async function preparar() {
  if (preparando.value) return
  preparando.value = true
  errorModelo.value = ''
  faseModelo.value = 'Preparando modelo'
  progresoModelo.value = 0
  try {
    const r = await VoskPilot.preparar()
    listo.value = Boolean(r?.listo)
    faseModelo.value = listo.value ? 'Modelo listo' : 'Modelo no disponible'
  } catch (e) {
    errorModelo.value = e?.message || 'No se pudo preparar el modelo'
    faseModelo.value = ''
  } finally {
    preparando.value = false
  }
}

function persistir() {
  try {
    localStorage.setItem(KEY_SESION, JSON.stringify(sesion.value))
  } catch {
    /* noop */
  }
}

function guardarToma(r) {
  const toma = {
    esperado: fraseActual.value.texto,
    texto: r?.text || '',
    confidence: Number(r?.confidence) || 0,
    alternativas: Array.isArray(r?.alternativas) ? r.alternativas.length : 0,
    msAudio: Number(r?.msAudio) || 0,
    msDecode: Number(r?.msDecode) || 0,
    valoracion: '',
    fecha: new Date().toISOString()
  }
  sesion.value.push(toma)
  persistir()
  valoracion.value = ''
}

async function empezar() {
  if (grabando.value) return
  if (!listo.value) {
    toast.add({ title: 'El modelo todavía no está listo', color: 'warning' })
    return
  }

  const permiso = await VoskPilot.requestPermission().catch(() => ({ ok: false }))
  if (!permiso?.ok) {
    toast.add({ title: 'Falta permiso de micrófono', color: 'error' })
    return
  }

  resultado.value = null
  parcial.value = ''
  valoracion.value = ''
  grabando.value = true
  try {
    const r = await VoskPilot.start()
    resultado.value = r
    parcial.value = r?.text || ''
    guardarToma(r)
  } catch (e) {
    const detalle = e?.message || 'Error de grabación'
    if (!detalle.includes('cancel')) {
      toast.add({ title: 'No se pudo transcribir', description: detalle, color: 'error' })
    }
  } finally {
    grabando.value = false
  }
}

async function detener() {
  if (!grabando.value) return
  try {
    await VoskPilot.finish()
  } catch {
    /* el error se muestra al resolver start */
  }
}

function valorar(valor) {
  valoracion.value = valor
  const ultima = sesion.value[sesion.value.length - 1]
  if (ultima) {
    ultima.valoracion = valor
    persistir()
  }
}

function siguienteFrase() {
  const indice = FRASES_PILOTO.findIndex(f => f.id === fraseId.value)
  fraseId.value = FRASES_PILOTO[(indice + 1) % FRASES_PILOTO.length].id
  resultado.value = null
  parcial.value = ''
  valoracion.value = ''
}

async function copiarInforme() {
  if (!sesion.value.length) {
    toast.add({ title: 'Todavía no hay tomas', color: 'warning' })
    return
  }
  const texto = formatearInforme(sesion.value, {
    fecha: new Date().toISOString(),
    motor: 'vosk',
    modelo: 'vosk-model-small-es-0.42',
    sampleRate: 16000,
    dispositivo: typeof navigator === 'undefined' ? '' : navigator.userAgent
  })
  try {
    await navigator.clipboard.writeText(texto)
    toast.add({ title: 'Informe copiado', description: 'Pégalo en el chat.', color: 'success' })
  } catch {
    toast.add({
      title: 'No se pudo copiar',
      description: 'Mantén pulsado el texto del informe y elige Copiar.',
      color: 'warning'
    })
  }
}

function vaciarSesion() {
  if (!sesion.value.length) return
  // Confirmación explícita: borrar 30 tomas por accidente obliga a repetirlas.
  if (typeof window !== 'undefined' && !window.confirm('¿Borrar todas las tomas del piloto?')) return
  sesion.value = []
  persistir()
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6">
    <div class="flex items-start gap-2">
      <UButton
        to="/settings"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Volver a Ajustes"
      />
      <div>
        <h1 class="text-2xl font-semibold">
          Laboratorio de voz
        </h1>
        <p class="text-sm text-muted">
          Piloto de reconocimiento offline. No cambia los comandos de la app.
        </p>
      </div>
    </div>

    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-flask-conical"
      title="Piloto aislado"
      description="Solo graba y transcribe. El resultado no se ejecuta ni se guarda en la base de datos. El informe queda en este teléfono hasta que lo copies."
    />

    <!-- Modelo -->
    <UCard>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-medium">
            Modelo offline
          </h2>
          <UBadge
            :color="listo ? 'success' : errorModelo ? 'error' : 'neutral'"
            variant="soft"
            size="sm"
          >
            {{ listo ? 'Listo' : errorModelo ? 'Error' : 'Preparando' }}
          </UBadge>
        </div>

        <p class="text-xs text-muted">
          Vosk · español · empaquetado en la app (39 MB). No requiere descargar
          paquetes de voz ni depender del servicio de Google.
        </p>

        <UProgress
          v-if="preparando"
          v-model="progresoModelo"
          size="sm"
        />
        <p v-if="faseModelo" class="text-xs text-muted">
          {{ faseModelo }}
        </p>
        <p v-if="errorModelo" class="text-xs text-error">
          {{ errorModelo }}
        </p>
        <UButton
          v-if="errorModelo"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          @click="preparar"
        >
          Reintentar
        </UButton>
      </div>
    </UCard>

    <!-- Grabación -->
    <UCard>
      <div class="space-y-4">
        <UFormField label="Frase que vas a decir">
          <USelect
            v-model="fraseId"
            :items="frasesSelect"
            :disabled="grabando"
            size="lg"
          />
        </UFormField>

        <UButton
          v-if="!grabando"
          block
          size="xl"
          color="primary"
          icon="i-lucide-mic"
          :disabled="!listo"
          @click="empezar"
        >
          Hablar
        </UButton>
        <UButton
          v-else
          block
          size="xl"
          color="error"
          icon="i-lucide-square"
          @click="detener"
        >
          Detener y transcribir
        </UButton>

        <p class="text-xs text-muted">
          {{ grabando ? 'Habla ahora. Al terminar, pulsa Detener.' : 'Pulsa Hablar, di la frase y pulsa Detener.' }}
        </p>

        <div
          v-if="grabando || parcial"
          class="rounded-lg border border-default bg-elevated/50 p-3"
        >
          <p class="text-xs font-medium text-muted">
            En vivo
          </p>
          <p class="text-sm">
            {{ parcial || '…' }}
          </p>
        </div>
      </div>
    </UCard>

    <!-- Resultado -->
    <UCard v-if="resultado">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-medium">
            Resultado
          </h2>
          <UBadge
            :color="evaluacion?.ok ? 'success' : 'warning'"
            variant="soft"
            size="sm"
          >
            {{ evaluacion?.ok ? 'Coincide' : 'Revisar' }}
          </UBadge>
        </div>

        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">
            Esperado
          </p>
          <p class="text-sm">
            {{ fraseActual.texto }}
          </p>
          <p class="mt-2 text-xs text-muted">
            Transcripto
          </p>
          <p class="text-sm font-medium">
            {{ resultado.text || '(nada)' }}
          </p>
        </div>

        <p v-if="evaluacion && !evaluacion.ok && evaluacion.faltanClave.length" class="text-xs text-warning">
          Faltaron: {{ evaluacion.faltanClave.join(', ') }}
        </p>

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Confianza: {{ Number(resultado.confidence || 0).toFixed(2) }}</span>
          <span>Audio: {{ (Number(resultado.msAudio || 0) / 1000).toFixed(1) }} s</span>
          <span>Proceso: {{ (Number(resultado.msDecode || 0) / 1000).toFixed(2) }} s</span>
          <span>Alternativas: {{ (resultado.alternativas || []).length }}</span>
        </div>

        <div v-if="(resultado.alternativas || []).length > 1" class="space-y-1">
          <p class="text-xs font-medium text-muted">
            Alternativas
          </p>
          <ol class="list-decimal space-y-0.5 pl-5 text-xs text-muted">
            <li v-for="(alt, i) in resultado.alternativas" :key="i">
              {{ alt.texto || alt.text }}
            </li>
          </ol>
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted">
            ¿La transcripción sirve para el comando?
          </p>
          <div class="flex gap-2">
            <UButton
              size="sm"
              :color="valoracion === 'bien' ? 'success' : 'neutral'"
              :variant="valoracion === 'bien' ? 'solid' : 'outline'"
              icon="i-lucide-thumbs-up"
              @click="valorar('bien')"
            >
              Bien
            </UButton>
            <UButton
              size="sm"
              :color="valoracion === 'regular' ? 'warning' : 'neutral'"
              :variant="valoracion === 'regular' ? 'solid' : 'outline'"
              icon="i-lucide-minus"
              @click="valorar('regular')"
            >
              Regular
            </UButton>
            <UButton
              size="sm"
              :color="valoracion === 'mal' ? 'error' : 'neutral'"
              :variant="valoracion === 'mal' ? 'solid' : 'outline'"
              icon="i-lucide-thumbs-down"
              @click="valorar('mal')"
            >
              Mal
            </UButton>
          </div>
        </div>

        <UButton
          block
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-right"
          @click="siguienteFrase"
        >
          Siguiente frase
        </UButton>
      </div>
    </UCard>

    <!-- Sesión -->
    <UCard>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-medium">
            Sesión
          </h2>
          <span class="text-xs text-muted">
            {{ resumen.total }} tomas · {{ resumen.porcentaje }}% ok · {{ resumen.decode.toFixed(2) }} s
          </span>
        </div>

        <p v-if="!sesion.length" class="text-xs text-muted">
          Aún no hay tomas guardadas.
        </p>

        <div v-else class="max-h-48 space-y-1 overflow-auto">
          <p
            v-for="(toma, i) in sesion.slice().reverse()"
            :key="i"
            class="rounded-md border border-default px-2 py-1 text-xs"
          >
            <span class="text-muted">{{ sesion.length - i }}.</span>
            {{ toma.texto || '(nada)' }}
            <span class="text-muted">· {{ toma.valoracion || 'sin valorar' }}</span>
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-copy"
            :disabled="!sesion.length"
            @click="copiarInforme"
          >
            Copiar informe
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="!sesion.length"
            @click="vaciarSesion"
          >
            Vaciar
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
