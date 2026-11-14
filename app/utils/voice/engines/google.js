import { registerPlugin } from '@capacitor/core'

/**
 * Reconocedor de Android (SpeechRecognizer). En este dispositivo el servicio
 * por defecto es Google; el plugin decide online/offline con EXTRA_PREFER_OFFLINE.
 */
export const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')
