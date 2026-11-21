/**
 * app/utils/voice/vigilancia.js — reglas del vigilante de escucha (puro).
 *
 * Algunos motores (Google offline, Vosk) no cierran la escucha solos: emiten
 * `end`/`beginning` en bucle y nunca llaman a `onResults`. Estas reglas deciden
 * cuándo pedir `finish()` y cuándo rescatar el último parcial.
 *
 * El silencio es adaptativo (P12): una frase que ya tiene forma completa se
 * cierra antes que una que termina en «de» o «para», que es justo donde la
 * gente duda. Así no se pierde el dictado ni se añade silencio muerto a las
 * ventas rápidas.
 */
import {
  MAX_EXTENSIONES_ESCUCHA,
  MS_ESCUCHA_COLGANTE,
  MS_ESCUCHA_COMPLETA
} from '../../../shared/voz/config.js'

export { MAX_EXTENSIONES_ESCUCHA, MS_ESCUCHA_COLGANTE, MS_ESCUCHA_COMPLETA }

/** Silencio tras el último texto reconocido antes de pedir el resultado. */
export const MS_TEXTO_ESTABLE = 1200
/** Tope sin una sola palabra reconocida desde `ready`. */
export const MS_SIN_VOZ = 8000
/** Margen tras `finish()` para que llegue el resultado antes de rescatarlo. */
export const MS_RESCATE = 2000

/**
 * Palabras que no cierran una frase: artículos, preposiciones y conjunciones.
 * Si el parcial termina en una, lo más probable es que el dictado siga.
 */
export const PALABRAS_COLGANTES = [
  'a', 'al', 'con', 'de', 'del', 'el', 'la', 'las', 'los',
  'para', 'un', 'una', 'unos', 'unas', 'y'
]

/** Minúsculas, sin tildes y sin puntuación, para comparar palabras. */
function palabraSuelta(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * ¿El dictado parece a medias? Mira la última palabra del parcial.
 *
 * «vende dos panes de» sí; «vende dos panes» no. Devuelve `false` con un
 * parcial vacío, que es el caso de «todavía no ha dicho nada».
 */
export function pareceIncompleta(ultimoParcial) {
  const texto = String(ultimoParcial ?? '').trim()
  if (!texto) return false
  const palabras = texto.split(/\s+/).filter(Boolean)
  if (!palabras.length) return false
  const ultima = palabraSuelta(palabras[palabras.length - 1])
  if (!ultima) return false
  return PALABRAS_COLGANTES.includes(ultima)
}

/**
 * Cuánto silencio se tolera con el texto que hay ahora, en ms.
 *
 * - Sin dato de forma (`terminaEnPalabraColgante` ausente): 1200, lo de siempre.
 * - Frase con forma completa: 1000, más rápido que antes.
 * - Frase a medias y quedan extensiones: 2800.
 * - Extensiones agotadas: 1200, para cerrar igual que antes.
 *
 * `limites.textoEstable` sigue mandando si se pasa, para pruebas y ajustes.
 */
export function limiteEscuchaTexto({
  terminaEnPalabraColgante,
  extensionesUsadas = 0,
  limites = {}
} = {}) {
  if (Number.isFinite(limites.textoEstable)) return limites.textoEstable
  if (typeof terminaEnPalabraColgante !== 'boolean') return MS_TEXTO_ESTABLE
  if (!terminaEnPalabraColgante) return MS_ESCUCHA_COMPLETA
  const usadas = Math.max(0, Math.trunc(Number(extensionesUsadas) || 0))
  return usadas < MAX_EXTENSIONES_ESCUCHA ? MS_ESCUCHA_COLGANTE : MS_TEXTO_ESTABLE
}

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
  terminaEnPalabraColgante,
  extensionesUsadas = 0,
  limites = {}
} = {}) {
  if (finalizando) return 'esperar'
  const textoEstable = limiteEscuchaTexto({ terminaEnPalabraColgante, extensionesUsadas, limites })
  const sinVoz = Number.isFinite(limites.sinVoz) ? limites.sinVoz : MS_SIN_VOZ
  if (hayTexto) {
    return Number.isFinite(desdeTextoMs) && desdeTextoMs >= textoEstable ? 'terminar' : 'esperar'
  }
  return Number.isFinite(desdeReadyMs) && desdeReadyMs >= sinVoz ? 'sin_voz' : 'esperar'
}
