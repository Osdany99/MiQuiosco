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
  hayRed
}) {
  if (!configLista) return 'Cargando…'
  if (!tienePermiso) return null
  if (!esNativo && !webSoportado) {
    return 'La voz web requiere un navegador compatible (Chrome/Edge) en contexto seguro (HTTPS).'
  }
  if (esNativo && nativoDisponible === false) {
    return 'Este dispositivo no tiene reconocimiento de voz.'
  }
  if (esNativo && permisoMicrofono === false) {
    return 'Falta el permiso de micrófono.'
  }
  if (modo !== 'online') return 'Modo local: la voz no está disponible.'
  if (!hayRed) return 'Sin conexión: la voz no está disponible.'
  return null
}
