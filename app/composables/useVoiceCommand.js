import { computed, ref } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'

// Plugin nativo propio (android/app/src/main/java/com/myquiosco/app/VoiceRecognitionNativePlugin.java).
const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')

/**
 * El plugin no tiene timeout: si el reconocedor se queda esperando, el
 * micrófono sigue abierto. Este tope llama a stop() para cerrarlo.
 */
const TIMEOUT_MS = 10_000

const MENSAJES_STT = {
  no_match: 'No te entendí. Prueba otra vez.',
  speech_timeout: 'No se escuchó nada.',
  error_network: 'Sin conexión: el reconocimiento de voz necesita internet.',
  network_timeout: 'La conexión tardó demasiado.',
  recognizer_busy: 'El micrófono está ocupado. Intenta de nuevo.',
  insufficient_permissions: 'Falta el permiso de micrófono.',
  not_available: 'Este dispositivo no tiene reconocimiento de voz.'
}

function esCancelacion(mensaje) {
  return String(mensaje ?? '').toLowerCase().includes('cancel')
}

/**
 * Envoltorio del STT nativo. Devuelve el transcript **y la confianza real** del
 * motor: la decisión de producto se toma con ambas (ver shared/voz/gramatica.js).
 *
 * Es un singleton: en Android solo existe un `SpeechRecognizer` y en web no
 * tiene sentido abrir dos micrófonos a la vez (quiosco y almacén comparten el
 * mismo dock). Dos instancias peleando por el micrófono producían "busy" o
 * reconocimientos duplicados.
 */
function _useVoiceCommand() {
  const auth = useAuth()
  const estado = ref('idle') // idle | listening | ready | cancelled | error
  const transcript = ref('')
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
  const isListening = computed(() => estado.value === 'listening')
  const disponible = computed(() => backend.value !== null)

  // App exclusiva para Cuba en español: no hay selector de idioma. Se usa
  // es-ES porque Google SpeechRecognizer tiene mejor cobertura que es-CU
  // (es-CU no está garantizado y puede fallar en dispositivos reales).
  async function startListening(options = { language: 'es-ES' }) {
    if (estado.value === 'listening') return

    estado.value = 'listening'
    transcript.value = ''
    confidence.value = 0
    error.value = null

    if (!esNativo.value) {
      if (!esWebSoportado.value) {
        error.value = 'El reconocimiento de voz solo está disponible en la app Android o en navegadores compatibles (Chrome/Edge en HTTPS).'
        estado.value = 'error'
        return
      }

      // --- Backend web (Web Speech API) ---
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
          rec.interimResults = false
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
            if (timer) clearTimeout(timer)
            timer = null
            const r = event?.results?.[0]?.[0]
            resolve({ text: r?.transcript ?? '', confidence: Number(r?.confidence) || 0 })
          }
          rec.onerror = (event) => {
            if (timer) clearTimeout(timer)
            timer = null
            const code = event?.error || 'unknown'
            if (code === 'no-speech') reject(new Error('speech_timeout'))
            else if (code === 'aborted') reject(new Error('cancelled'))
            else if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') reject(new Error('insufficient_permissions'))
            else if (code === 'network') reject(new Error('error_network'))
            else reject(new Error(code))
          }
          rec.onend = () => {
            // Si termina sin resultado, resolvemos vacío para no colgar la UI.
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
        confidence.value = Number(resultado.confidence) || 0
        estado.value = 'ready'
      } catch (e) {
        const detalle = e?.message || 'Error desconocido'
        instanciaWeb = null
        if (esCancelacion(detalle)) {
          estado.value = 'cancelled'
        } else {
          error.value = MENSAJES_STT[detalle] || (detalle === 'timeout' ? 'La escucha tardó demasiado.' : detalle)
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

    // --- Backend nativo (Android) ---
    let timer = null
    try {
      auth.registrarActividad()

      const permiso = await VoiceRecognitionNative.requestPermission()
      if (permiso && permiso.ok === false) throw new Error('insufficient_permissions')

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
      confidence.value = Number(resultado?.confidence) || 0
      estado.value = 'ready'
    } catch (e) {
      const detalle = e?.message || 'Error desconocido'
      if (esCancelacion(detalle)) {
        estado.value = 'cancelled'
      } else {
        error.value = MENSAJES_STT[detalle] || (detalle === 'timeout' ? 'La escucha tardó demasiado.' : detalle)
        estado.value = 'error'
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async function stopListening() {
    auth.registrarActividad()
    if (esNativo.value) {
      try {
        await VoiceRecognitionNative.stop()
      } catch {
        // Si ya terminó, el plugin rechaza: no es un error de usuario.
      }
    } else if (instanciaWeb) {
      try {
        instanciaWeb.stop()
      } catch {
        // ignore
      }
      instanciaWeb = null
    }
    estado.value = 'idle'
  }

  function reset() {
    estado.value = 'idle'
    transcript.value = ''
    confidence.value = 0
    error.value = null
  }

  return {
    estado,
    transcript,
    confidence,
    error,
    esNativo,
    backend,
    esWebSoportado,
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
