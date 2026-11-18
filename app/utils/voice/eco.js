/**
 * app/utils/voice/eco.js — detección del eco del propio TTS (puro).
 *
 * El micrófono se abre justo después de que el motor termine de hablar. En
 * Android, `onDone` del TTS no garantiza que el audio ya salió del altavoz, así
 * que el reconocedor puede oír la propia petición ("diga sí para confirmar") y
 * tomarla como respuesta. Este módulo compara la transcripción con el prompt y
 * descarta lo que sea un eco.
 *
 * Sin Vue y sin datos: se prueba con `node --test` (tests/voz.test.js).
 */
import { normalizar } from '../../../shared/voz/gramatica.js'

/**
 * Margen tras el TTS antes de abrir el micrófono. 60 ms era insuficiente: el
 * buffer del altavoz y el AEC del reconocedor necesitan algo más.
 */
export const MS_MARGEN_ANTIECO = 400

/** Palabras que cuentan para el solape: las cortas ("sí", "no") son ruido. */
const LARGO_MINIMO = 3

function palabras(texto) {
  return normalizar(texto)
    .split(' ')
    .filter(p => p.length >= LARGO_MINIMO)
}

/**
 * ¿`texto` es un eco de `prompt`?
 *
 * Se compara el conjunto de palabras del texto con el del prompt: si al menos
 * `umbral` de lo que se oyó aparece en la petición, se descarta. Con "diga sí
 * para confirmar" como prompt, un "sí" suelto NO es eco (es la respuesta que
 * esperamos) porque las palabras de menos de 3 letras no cuentan.
 */
export function esEcoDePrompt(texto, prompt, { umbral = 0.6 } = {}) {
  const oido = palabras(texto)
  if (!oido.length) return false
  const dicho = new Set(palabras(prompt))
  if (!dicho.size) return false
  let coinciden = 0
  for (const palabra of oido) {
    if (dicho.has(palabra)) coinciden++
  }
  return coinciden / oido.length >= umbral
}

/**
 * ¿`texto` es una palabra suelta que ya estaba en el prompt?
 *
 * `esEcoDePrompt` ignora las palabras de menos de 3 letras porque "sí" y "no"
 * son justo la respuesta esperada. Pero eso deja pasar el caso peligroso: el
 * micrófono oye solo el «sí» de «diga **sí** para confirmar» y se toma como una
 * confirmación real. Aquí se compara sin ese mínimo, para descartar el eco
 * cuando la respuesta llega pegada al final del anuncio.
 */
export function ecoPalabraSuelta(texto, prompt) {
  const oido = normalizar(texto).split(' ').filter(Boolean)
  if (!oido.length) return false
  const dicho = new Set(normalizar(prompt).split(' ').filter(Boolean))
  if (!dicho.size) return false
  return oido.every(palabra => dicho.has(palabra))
}

/**
 * Quita del texto las palabras que ya estaban en el anuncio y devuelve lo que
 * sobra, en orden. Sirve para el caso real en el que el micrófono captura el
 * final del TTS y, pegado, el «sí» del jefe: `diga sí para confirmar sí` deja
 * `si` como respuesta. Se compara por apariciones (multiconjunto), así una
 * palabra repetida por el jefe no se consume con la del anuncio.
 */
export function respuestaTrasEco(texto, prompt) {
  const oido = normalizar(texto).split(' ').filter(Boolean)
  if (!oido.length) return ''
  const restantes = new Map()
  for (const palabra of normalizar(prompt).split(' ').filter(Boolean)) {
    restantes.set(palabra, (restantes.get(palabra) || 0) + 1)
  }
  const resto = []
  for (const palabra of oido) {
    const quedan = restantes.get(palabra) || 0
    if (quedan > 0) restantes.set(palabra, quedan - 1)
    else resto.push(palabra)
  }
  return resto.join(' ')
}
