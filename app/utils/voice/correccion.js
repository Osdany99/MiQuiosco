/**
 * app/utils/voice/correccion.js — corrección de cantidad en la confirmación.
 *
 * El caso real: el reconocimiento oye «2 panes» donde el jefe dijo «12», lee la
 * venta y el jefe responde «no, eran tres». Sin esto la venta se cancelaba y
 * había que repetir el comando completo.
 *
 * Puro (sin Vue ni Capacitor) para probarlo con `node --test`. Solo se acepta
 * durante la confirmación: una frase fuera de ese momento nunca cambia una
 * cantidad.
 */
import { normalizar, parseNumberSequence } from '../../../shared/voz/gramatica.js'

/** Verbos/marcas que convierten una respuesta en corrección, no en un «no». */
const MARCAS_CORRECCION = /\b(eran|era|son|cambia|cambialo|cambiar|pon|ponme|mejor|no)\b/

const CANTIDAD_MAX = 9999

/**
 * Devuelve `{ cantidad }` si la frase corrige la cantidad, o `null`.
 *
 * - "no, eran tres" → 3
 * - "cambia a cinco" → 5
 * - "pon seis" → 6
 * - "no" / "sí" / "no gracias" → null (son respuestas normales)
 */
export function extraerCorreccion(texto) {
  const plano = normalizar(texto)
  if (!plano) return null
  if (!MARCAS_CORRECCION.test(plano)) return null

  const tokens = plano.split(' ').filter(Boolean)

  // "una docena" no es 1: la docena manda sobre el artículo.
  const idxDocena = tokens.findIndex(t => t === 'docena' || t === 'docenas')
  if (idxDocena >= 0) {
    let factor = 1
    for (let i = 0; i < idxDocena; i++) {
      const token = tokens[i]
      if (token === 'un' || token === 'una' || token === 'uno') continue
      const secuencia = parseNumberSequence(tokens.slice(i, idxDocena))
      if (secuencia && secuencia.consumidos) {
        factor = Math.trunc(Number(secuencia.valor) || 1)
        break
      }
    }
    const docenas = 12 * Math.max(1, factor)
    if (docenas <= CANTIDAD_MAX) return { cantidad: docenas }
  }

  for (let i = 0; i < tokens.length; i++) {
    const secuencia = parseNumberSequence(tokens.slice(i))
    if (!secuencia || !secuencia.consumidos) continue
    const cantidad = Math.trunc(Number(secuencia.valor) || 0)
    if (cantidad >= 1 && cantidad <= CANTIDAD_MAX) return { cantidad }
  }
  return null
}
