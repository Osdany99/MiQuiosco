/**
 * app/utils/voice/vigilancia.js — reglas del vigilante de escucha (puro).
 *
 * Algunos motores (Google offline, Vosk) no cierran la escucha solos: emiten
 * `end`/`beginning` en bucle y nunca llaman a `onResults`. Estas reglas deciden
 * cuándo pedir `finish()` y cuándo rescatar el último parcial.
 */

/** Silencio tras el último texto reconocido antes de pedir el resultado. */
export const MS_TEXTO_ESTABLE = 1200
/** Tope sin una sola palabra reconocida desde `ready`. */
export const MS_SIN_VOZ = 8000
/** Margen tras `finish()` para que llegue el resultado antes de rescatarlo. */
export const MS_RESCATE = 2000

/**
 * Decide qué hacer con una escucha en curso.
 *
 * - `terminar`: hay texto y dejó de cambiar → pedir `finish()`.
 * - `sin_voz`: pasó el tope sin captar nada → cerrar y avisar.
 * - `esperar`: sigue habiendo actividad (o ya se está cerrando).
 */
export function decidirVigilancia({
  desdeReadyMs = null,
  desdeTextoMs = null,
  hayTexto = false,
  finalizando = false,
  limites = {}
} = {}) {
  if (finalizando) return 'esperar'
  const textoEstable = Number.isFinite(limites.textoEstable) ? limites.textoEstable : MS_TEXTO_ESTABLE
  const sinVoz = Number.isFinite(limites.sinVoz) ? limites.sinVoz : MS_SIN_VOZ
  if (hayTexto) {
    return Number.isFinite(desdeTextoMs) && desdeTextoMs >= textoEstable ? 'terminar' : 'esperar'
  }
  return Number.isFinite(desdeReadyMs) && desdeReadyMs >= sinVoz ? 'sin_voz' : 'esperar'
}
