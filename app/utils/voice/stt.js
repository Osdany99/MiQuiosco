/**
 * app/utils/voice/stt.js — Mapeo de errores STT (puro).
 */

export const MENSAJES_STT = {
  no_match: 'No te entendí. Prueba otra vez.',
  speech_timeout: 'No se escuchó nada.',
  error_network: 'Sin conexión: el reconocimiento de voz necesita internet.',
  network_timeout: 'La conexión tardó demasiado.',
  recognizer_busy: 'El micrófono está ocupado. Intenta de nuevo.',
  insufficient_permissions: 'Falta el permiso de micrófono.',
  not_available: 'Este dispositivo no tiene reconocimiento de voz.'
}

export function mensajeStt(detalle) {
  const d = String(detalle ?? '')
  if (Object.prototype.hasOwnProperty.call(MENSAJES_STT, d)) {
    return MENSAJES_STT[d]
  }
  if (d === 'timeout') return 'La escucha tardó demasiado.'
  return d
}
