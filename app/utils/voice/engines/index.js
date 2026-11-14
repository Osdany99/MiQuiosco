import { MOTORES_CATALOGO, OPCIONES_MOTOR, resolverPreferencia } from './catalogo'
import { VoiceRecognitionNative } from './google'
import { VoskVoice } from './vosk'

const PLUGINS = {
  google: VoiceRecognitionNative,
  vosk: VoskVoice
}

export const MOTORES = MOTORES_CATALOGO.map(motor => ({
  ...motor,
  plugin: PLUGINS[motor.id]
}))

export { OPCIONES_MOTOR }

export function resolverSeleccion(preferencia, hayInternet) {
  return resolverPreferencia(preferencia, hayInternet, MOTORES)
}
