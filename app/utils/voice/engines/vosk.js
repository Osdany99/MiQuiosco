import { registerPlugin } from '@capacitor/core'

/**
 * Reconocedor offline empaquetado (Vosk).
 *
 * Solo se llama a `preparar()` / `start()` cuando el usuario lo selecciona en
 * Ajustes. Si no se selecciona, este plugin no participa en ningún comando.
 */
export const VoskVoice = registerPlugin('VoskVoice')
