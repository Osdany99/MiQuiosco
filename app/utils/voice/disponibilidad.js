/**
 * app/utils/voice/disponibilidad.js — motivo de no disponibilidad de voz (puro).
 */
export function calcularMotivoNoDisponible({
  configLista,
  tienePermiso,
  esNativo,
  webSoportado,
  nativoDisponible,
  permisoMicrofono,
  modo,
  hayRed,
  motor = null
}) {
  if (!configLista) return 'Cargando…'
  if (!tienePermiso) return null
  if (!esNativo && !webSoportado) {
    return 'La voz web requiere un navegador compatible (Chrome/Edge) en contexto seguro (HTTPS).'
  }
  // Vosk trae su propio modelo y su propio permiso: no debe bloquearse porque
  // el reconocedor de Google no esté disponible o sin permiso en el equipo.
  const revisarGoogle = esNativo && motor !== 'vosk'
  if (revisarGoogle && nativoDisponible === false) {
    return 'Este dispositivo no tiene reconocimiento de voz.'
  }
  if (revisarGoogle && permisoMicrofono === false) {
    return 'Falta el permiso de micrófono.'
  }
  // En Android nativo, STT (plugin VoiceRecognitionNative) y TTS
  // funcionan sin red. No bloquear por modo local ni por falta de internet.
  if (esNativo) return null
  if (modo === 'local') return 'Modo local: la voz no está disponible.'
  if (!hayRed) return 'Sin conexión: la voz no está disponible.'
  return null
}
