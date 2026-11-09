import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'

/**
 * Nivel de audio del micrófono (0..1) para animar las ondas de la interfaz de voz.
 *
 * - Android nativo: el plugin emite eventos "level" a partir de onRmsChanged.
 * - Web: se abre un AnalyserNode sobre getUserMedia (mejor esfuerzo; si el
 *   navegador no deja compartir el micrófono con el reconocedor, la onda cae
 *   a un modo "respiración" y la animación no se rompe).
 *
 * El valor ya viene suavizado (ataque rápido, caída lenta) para que la onda
 * no parpadee.
 */

const nivel = ref(0)
const detectandoVoz = ref(false)

let objetivo = 0
let rafId = null
let flujo = null
let ctx = null
let analizador = null
let datos = null
let escuchaNativa = null
let activo = false

function suavizar() {
  const sube = objetivo > nivel.value
  nivel.value += (objetivo - nivel.value) * (sube ? 0.45 : 0.12)
  if (nivel.value < 0.001) nivel.value = 0
  detectandoVoz.value = nivel.value > 0.12
  if (activo) rafId = requestAnimationFrame(suavizar)
}

/** Convierte dB del reconocedor (≈ -2..10) a 0..1. */
export function normalizarRms(db) {
  const n = Number(db)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, (n + 2) / 12))
}

function leerWeb() {
  if (!activo || !analizador) return
  analizador.getByteTimeDomainData(datos)
  let suma = 0
  for (let i = 0; i < datos.length; i++) {
    const v = (datos[i] - 128) / 128
    suma += v * v
  }
  const rms = Math.sqrt(suma / datos.length)
  objetivo = Math.min(1, rms * 5)
  setTimeout(leerWeb, 50)
}

async function abrirWeb() {
  try {
    if (!navigator?.mediaDevices?.getUserMedia) return
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    })
    if (!activo) {
      cerrarWeb()
      return
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    ctx = new AudioCtx()
    const fuente = ctx.createMediaStreamSource(flujo)
    analizador = ctx.createAnalyser()
    analizador.fftSize = 512
    datos = new Uint8Array(analizador.fftSize)
    fuente.connect(analizador)
    leerWeb()
  } catch {
    // Sin acceso extra al micrófono: la onda usa el modo de reposo.
  }
}

function cerrarWeb() {
  try {
    flujo?.getTracks().forEach(t => t.stop())
  } catch { /* noop */ }
  try {
    ctx?.close()
  } catch { /* noop */ }
  flujo = null
  ctx = null
  analizador = null
  datos = null
}

async function abrirNativo() {
  try {
    const plugin = Capacitor.Plugins?.VoiceRecognitionNative
    if (!plugin?.addListener) return
    escuchaNativa = await plugin.addListener('level', (d) => {
      objetivo = normalizarRms(d?.rms)
    })
    if (!activo) cerrarNativo()
  } catch { /* noop */ }
}

function cerrarNativo() {
  try {
    escuchaNativa?.remove()
  } catch { /* noop */ }
  escuchaNativa = null
}

function iniciar() {
  if (activo || typeof window === 'undefined') return
  activo = true
  objetivo = 0
  rafId = requestAnimationFrame(suavizar)
  let nativo = false
  try {
    nativo = Capacitor.isNativePlatform()
  } catch { /* noop */ }
  if (nativo) void abrirNativo()
  else void abrirWeb()
}

function detener() {
  activo = false
  objetivo = 0
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  cerrarWeb()
  cerrarNativo()
  nivel.value = 0
  detectandoVoz.value = false
}

export function useVoiceLevel() {
  return { nivel, detectandoVoz, iniciar, detener }
}
