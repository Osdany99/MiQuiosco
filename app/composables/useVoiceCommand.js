import { Capacitor, registerPlugin } from '@capacitor/core'
import { mensajeStt } from '../utils/voice/stt'

const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')

const TIMEOUT_MS = 10_000

function esCancelacion(mensaje) {
  return String(mensaje ?? '').toLowerCase().includes('cancel')
}

function _useVoiceCommand() {
  const auth = useAuth()
  const estado = ref('idle')
  const transcript = ref('')
  const transcriptParcial = ref('')
  const confidence = ref(0)
  const error = ref(null)
  let instanciaWeb = null
  const esNativo = computed(() => {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  })
  const SpeechRecognitionCtor = computed(() => {
    if (typeof window === 'undefined') return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  })
  const esContextoSeguro = computed(() => {
    try {
      if (typeof window === 'undefined') return true
      if (typeof window.isSecureContext === 'boolean') return window.isSecureContext
      return true
    } catch {
      return true
    }
  })
  const esWebSoportado = computed(() => Boolean(SpeechRecognitionCtor.value) && esContextoSeguro.value)
  const backend = computed(() => {
    if (esNativo.value) return 'native'
    if (esWebSoportado.value) return 'web'
    return null
  })
  const disponible = computed(() => backend.value !== null)
  const isListening = computed(() => estado.value === 'listening')

  const nativoDisponible = ref(null)
  const permisoMicrofono = ref(false)
  async function check() {
    if (!esNativo.value) return null
    try {
      const r = await VoiceRecognitionNative.check()
      nativoDisponible.value = Boolean(r?.available)
      permisoMicrofono.value = Boolean(r?.permission)
      return r
    } catch {
      nativoDisponible.value = false
      permisoMicrofono.value = false
      return null
    }
  }
  async function pedirPermisoMicrofono() {
    if (!esNativo.value) return true
    try {
      const r = await VoiceRecognitionNative.requestPermission()
      const ok = !r || r.ok !== false
      await check()
      return ok
    } catch {
      await check()
      return false
    }
  }

  async function startListening(options = { language: 'es-ES' }) {
    if (estado.value === 'listening') return
    estado.value = 'listening'
    transcript.value = ''
    transcriptParcial.value = ''
    confidence.value = 0
    error.value = null
    if (!esNativo.value) {
      if (!esWebSoportado.value) {
        error.value = 'El reconocimiento de voz solo está disponible en la app Android o en navegadores compatibles (Chrome/Edge en HTTPS).'
        estado.value = 'error'
        return
      }
      let rec = null
      let timer = null
      auth.registrarActividad()
      try {
        const resultado = await new Promise((resolve, reject) => {
          try {
            const Ctor = SpeechRecognitionCtor.value
            rec = new Ctor()
            instanciaWeb = rec
          } catch (e) {
            reject(e)
            return
          }
          rec.lang = options?.language || 'es-ES'
          rec.interimResults = true
          rec.maxAlternatives = 1
          rec.continuous = false
          timer = setTimeout(() => {
            if (timer) {
              const id = timer
              timer = null
              clearTimeout(id)
            }
            try {
              rec?.stop()
            } catch {
              // ignore
            }
            reject(new Error('timeout'))
          }, TIMEOUT_MS)
          rec.onresult = (event) => {
            const lista = event?.results
            const actual = lista?.[lista.length - 1]
            if (!actual) return
            const txt = actual?.[0]?.transcript ?? ''
            transcriptParcial.value = txt
            if (actual.isFinal) {
              if (timer) {
                clearTimeout(timer)
                timer = null
              }
              resolve({ text: txt, confidence: Number(actual?.[0]?.confidence) || 0 })
            }
          }
          rec.onerror = (event) => {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            const code = event?.error || 'unknown'
            if (code === 'no-speech') reject(new Error('speech_timeout'))
            else if (code === 'aborted') reject(new Error('cancelled'))
            else if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') reject(new Error('insufficient_permissions'))
            else if (code === 'network') reject(new Error('error_network'))
            else reject(new Error(code))
          }
          rec.onend = () => {
            if (timer) {
              clearTimeout(timer)
              timer = null
              resolve({ text: '', confidence: 0 })
            }
          }
          try {
            rec.start()
          } catch (e) {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            reject(e)
          }
        })
        if (resultado?.cancelled) {
          estado.value = 'cancelled'
          return
        }
        transcript.value = resultado.text ?? ''
        transcriptParcial.value = transcript.value
        confidence.value = Number(resultado.confidence) || 0
        estado.value = 'ready'
      } catch (e) {
        const detalle = e?.message || 'Error desconocido'
        instanciaWeb = null
        if (esCancelacion(detalle)) estado.value = 'cancelled'
        else {
          error.value = mensajeStt(detalle)
          estado.value = 'error'
        }
      } finally {
        if (timer) clearTimeout(timer)
        try {
          rec?.stop()
        } catch {
          // ignore
        }
        instanciaWeb = null
      }
      return
    }

    let nativePartial = null
    let timer = null
    try {
      auth.registrarActividad()
      const permiso = await VoiceRecognitionNative.requestPermission()
      if (permiso && permiso.ok === false) throw new Error('insufficient_permissions')
      if (VoiceRecognitionNative.addListener) {
        nativePartial = await VoiceRecognitionNative.addListener('partialResult', (d) => {
          transcriptParcial.value = d?.text ?? transcriptParcial.value
        })
      }
      const resultado = await Promise.race([
        VoiceRecognitionNative.start(options),
        new Promise((_, rechazar) => {
          timer = setTimeout(() => {
            VoiceRecognitionNative.stop().catch(() => {})
            rechazar(new Error('timeout'))
          }, TIMEOUT_MS)
        })
      ])
      transcript.value = resultado?.text ?? ''
      transcriptParcial.value = transcript.value
      confidence.value = Number(resultado?.confidence) || 0
      estado.value = 'ready'
    } catch (e) {
      const detalle = e?.message || 'Error desconocido'
      if (esCancelacion(detalle)) estado.value = 'cancelled'
      else {
        error.value = mensajeStt(detalle)
        estado.value = 'error'
      }
    } finally {
      if (timer) clearTimeout(timer)
      if (nativePartial) {
        try {
          await nativePartial.remove()
        } catch {
          // ignore
        }
      }
    }
  }

  async function stopListening(abandon = true) {
    auth.registrarActividad()
    if (esNativo.value) {
      try {
        if (abandon) await VoiceRecognitionNative.stop()
        else await VoiceRecognitionNative.finish()
      } catch {
        // ignore
      }
    } else if (instanciaWeb) {
      try {
        if (abandon) {
          if (instanciaWeb.abort) instanciaWeb.abort()
          else instanciaWeb.stop()
        } else {
          instanciaWeb.stop()
        }
      } catch {
        // ignore
      }
      if (abandon) instanciaWeb = null
    }
    if (abandon) estado.value = 'idle'
  }

  function reset() {
    estado.value = 'idle'
    transcript.value = ''
    transcriptParcial.value = ''
    confidence.value = 0
    error.value = null
  }

  return {
    estado,
    transcript,
    transcriptParcial,
    confidence,
    error,
    esNativo,
    backend,
    esWebSoportado,
    nativoDisponible,
    permisoMicrofono,
    check,
    pedirPermisoMicrofono,
    disponible,
    isListening,
    startListening,
    stopListening,
    reset
  }
}

let _voiceSingleton = null

export function useVoiceCommand() {
  if (!_voiceSingleton) _voiceSingleton = _useVoiceCommand()
  return _voiceSingleton
}
