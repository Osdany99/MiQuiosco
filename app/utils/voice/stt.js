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
  not_available: 'Este dispositivo no tiene reconocimiento de voz.',
  language_unavailable:
    'No hay reconocimiento de voz offline en español. Instálalo en Ajustes → Google → Voz → Reconocimiento de voz sin conexión.',
  language_not_supported:
    'El reconocedor no soporta español. Añade el idioma español al reconocimiento de voz del dispositivo.',
  too_many_requests: 'Demasiadas peticiones al reconocedor. Espera unos segundos.',
  server_disconnected:
    'El servicio de voz del dispositivo no responde. Revisa la conexión o instala el paquete de reconocimiento offline.',
  // Google no respondió (red o paquete offline ausente) y el modelo Vosk
  // tampoco está listo: no es solo «sin internet».
  sin_motor_disponible:
    'La voz no está disponible: revisa la conexión o descarga el modelo de voz offline en Ajustes → Voz.'
}

export function mensajeStt(detalle) {
  const d = String(detalle ?? '')
  if (Object.prototype.hasOwnProperty.call(MENSAJES_STT, d)) {
    return MENSAJES_STT[d]
  }
  if (d === 'timeout') return 'La escucha tardó demasiado.'
  // El modelo Vosk ya no viaja en la APK: su ausencia no es un fallo del
  // micrófono, es un aprovisionamiento pendiente que la app reintenta.
  if (/modelo de voz offline no est/i.test(d) || /modelo_no_descargado/i.test(d)) {
    return 'Falta el modelo de voz offline. Se descargará solo; también puedes importarlo en Ajustes → Voz.'
  }
  return d
}
