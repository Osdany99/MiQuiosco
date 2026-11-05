<template>
  <div class="p-4 max-w-3xl mx-auto space-y-4">
    <h1 class="text-xl font-bold">Voice Command MVP (Wave 1)</h1>

    <textarea v-model="manualText" class="w-full border p-2 text-sm" rows="2" placeholder="Ej: anota 5 panes a don juan"></textarea>

    <div class="flex gap-2">
      <button class="bg-gray-700 text-white px-4 py-2 rounded" @click="procesarManual">
        Parsear manual
      </button>
      <button class="bg-violet-600 text-white px-4 py-2 rounded" :disabled="running" @click="grabarEspanol">
        Mic (native)
      </button>
      <button class="bg-emerald-600 text-white px-4 py-2 rounded" @click="guardarLog">
        Guardar log ({{ historial.length }})
      </button>
    </div>
    <div v-if="guardado" class="text-sm text-emerald-600">Log guardado: {{ guardado }}</div>

    <div v-if="last" class="space-y-2 text-sm">
      <div>Ultimo transcript: <strong>{{ last.transcript }}</strong></div>
      <div>Intent: {{ last.intent }} | Confidence: {{ last.confidence }}</div>
      <div>Cantidad: {{ last.lines[0].cantidad }} | Ubicacion: {{ last.lines[0].ubicacion }} | Tipo: {{ last.lines[0].tipoVenta }} | Precio: {{ last.lines[0].precioUnitario }}</div>
      <div v-if="last.lines[0].clienteHint">Cliente hint: {{ last.lines[0].clienteHint }}</div>
      <div>
        Producto hint: {{ last.lines[0].productoHint }} | sugeridos:
        <span v-for="m in matches" :key="m.product.id" class="ml-2">
          {{ m.product.name }} (d={{ m.distance }})
        </span>
      </div>
      <div v-if="error" class="text-red-500">Error: {{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { parseVoiceCommand } from '~/utils/voice/parseVoiceCommand'
import { fuzzyMatchProducts } from '~/utils/voice/fuzzyMatchProducts'
import { registerPlugin, Capacitor } from '@capacitor/core'

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')

const manualText = ref('')
const last = ref(null)
const matches = ref([])
const error = ref(null)
const guardado = ref(null)
const running = ref(false)
const historial = ref([])

const catalogoDemo = [
  { id: '1', name: 'pan', canonicalSpeak: 'pan' },
  { id: '2', name: 'maní', canonicalSpeak: 'mani' },
  { id: '3', name: 'refresco', canonicalSpeak: 'refresco' },
  { id: '4', name: 'jkf', canonicalSpeak: 'jkf' },
  { id: '5', name: 'edite', canonicalSpeak: 'edite' }
]

function asignarMatch(transcript) {
  try {
    last.value = parseVoiceCommand(transcript)
    const hint = last.value.lines[0].productoHint || ''
    matches.value = fuzzyMatchProducts(hint, catalogoDemo)
    historial.value.push({
      ts: new Date().toISOString(),
      transcript,
      parsed: JSON.parse(JSON.stringify(last.value)),
      matches: (matches.value || []).map((m) => ({ name: m.product.name, distance: m.distance, score: m.score }))
    })
    error.value = null
    guardado.value = null
  } catch (e) {
    error.value = e && e.message ? e.message : String(e)
  }
}

function procesarManual() {
  if (!manualText.value) return
  asignarMatch(manualText.value)
}

async function guardarLog() {
  if (!historial.value.length) {
    error.value = 'No hay datos para guardar'
    return
  }
  try {
    const data = JSON.stringify(historial.value, null, 2)
    await Filesystem.writeFile({
      path: 'voice-command-log.json',
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    })
    guardado.value = 'voice-command-log.json'
    error.value = null
  } catch (e) {
    error.value = e && e.message ? e.message : String(e)
  }
}

async function grabarEspanol() {
  if (!Capacitor.isNativePlatform()) {
    error.value = 'Native speech plugin solo en Android'
    return
  }
  error.value = null
  running.value = true
  try {
    await VoiceRecognitionNative.requestPermission()
    const r = await VoiceRecognitionNative.start({ language: 'es-ES' })
    asignarMatch(r.text)
  } catch (e) {
    error.value = e && e.message ? e.message : String(e)
  } finally {
    running.value = false
  }
}
</script>