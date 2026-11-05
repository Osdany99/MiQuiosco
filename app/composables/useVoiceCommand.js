import { ref, computed } from 'vue'
import { registerPlugin, Capacitor } from '@capacitor/core'

// Plugin nativo creado en Fase 0
const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')

export function useVoiceCommand() {
  const auth = useAuth()
  const estado = ref('idle') // idle, listening, parsing, ready, error
  const transcript = ref('')
  const error = ref(null)
  
  // Interfaz pública
  const isListening = computed(() => estado.value === 'listening')
  
  async function startListening(options = { language: 'es-ES' }) {
    if (estado.value === 'listening') return
    
    estado.value = 'listening'
    transcript.value = ''
    error.value = null
    
    try {
      auth.registrarActividad()
      if (!Capacitor.isNativePlatform()) {
        throw new Error('Web Speech API no implementado aún')
      }
      if (Capacitor.isNativePlatform()) {
        await VoiceRecognitionNative.requestPermission()
        const result = await VoiceRecognitionNative.start(options)
        transcript.value = result.text
        estado.value = 'ready'
      } else {
        // Fallback Web Speech API (Fase 2)
        throw new Error('Web Speech API no implementado aún')
      }
    } catch (e) {
      error.value = e?.message || 'Error desconocido'
      estado.value = 'error'
    }
  }
  
  async function stopListening() {
    auth.registrarActividad()
    if (Capacitor.isNativePlatform()) {
      await VoiceRecognitionNative.stop()
    }
    estado.value = 'idle'
  }

  function reset() {
    estado.value = 'idle'
    transcript.value = ''
    error.value = null
  }
  
  return {
    estado,
    transcript,
    error,
    isListening,
    startListening,
    stopListening,
    reset
  }
}
