<template>
  <div class="p-4 max-w-3xl mx-auto space-y-4">
    <h1 class="text-xl font-bold">Spike STT nativo (Fase 0)</h1>
    <p class="text-sm text-gray-500">
      Solo en dispositivo Android. Habla en español y pulsa stop. Resultados se acumulan aquí abajo.
    </p>
    <div class="flex gap-2">
      <button @click="start" :disabled="running" class="bg-violet-600 text-white px-4 py-2 rounded">
        Grabar español
      </button>
      <button @click="stop" :disabled="!running" class="bg-gray-700 text-white px-4 py-2 rounded">
        Stop
      </button>
    </div>
    <div class="text-sm">
      <div>Estado: {{ estado }}</div>
      <div>Último transcript: <strong>{{ ultimo }}</strong></div>
      <div v-if="ultimoConfianza != null">Confianza: {{ ultimoConfianza }} | Latencia: {{ ultimaLatencia }} ms</div>
      <div v-if="error">Error: {{ error }}</div>
    </div>
    <table class="w-full text-sm border">
      <thead>
        <tr>
          <th class="border px-2 py-1">#</th>
          <th class="border px-2 py-1">Transcript</th>
          <th class="border px-2 py-1">Confianza</th>
          <th class="border px-2 py-1">Latencia (ms)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in filas" :key="i">
          <td class="border px-2 py-1">{{ i + 1 }}</td>
          <td class="border px-2 py-1">{{ r.text }}</td>
          <td class="border px-2 py-1">{{ r.confidence }}</td>
          <td class="border px-2 py-1">{{ r.durationMs }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { registerPlugin } from '@capacitor/core'

const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')

const estado = ref('idle')
const running = ref(false)
const error = ref(null)
const ultimo = ref('')
const ultimoConfianza = ref(null)
const ultimaLatencia = ref(null)
const filas = ref([])

async function start() {
  error.value = null
  estado.value = 'grabando'
  running.value = true
  try {
    await VoiceRecognitionNative.check()
    await VoiceRecognitionNative.requestPermission()
  } catch (e) {
    // continuar; start fallará si no hay permiso
  }
  VoiceRecognitionNative.start({ language: 'es-ES' })
    .then((r) => {
      ultimo.value = r.text
      ultimoConfianza.value = r.confidence
      ultimaLatencia.value = r.durationMs
      filas.value.push({ text: r.text, confidence: r.confidence, durationMs: r.durationMs })
      estado.value = 'listo'
    })
    .catch((e) => {
      error.value = e?.message || String(e)
      estado.value = 'error'
    })
    .finally(() => {
      running.value = false
    })
}

async function stop() {
  try {
    await VoiceRecognitionNative.stop()
  } catch (e) {
    error.value = e?.message || String(e)
  }
  estado.value = 'idle'
  running.value = false
}
</script>