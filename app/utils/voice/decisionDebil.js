/**
 * app/utils/voice/decisionDebil.js — qué hacer cuando el dictado es débil (puro).
 *
 * «Cinco panes» sin verbo es el dictado más natural de un mostrador, así que la
 * señal débil no se puede apagar sin más. Pero «son las cinco» o «dame la
 * bolsa» llegan con la misma forma. La diferencia no está en el verbo: está en
 * si el producto existe.
 *
 * Regla (F5.1/F5.3):
 * - producto con puntaje de sobra  -> vender como siempre;
 * - producto dudoso (dentro del umbral, sin margen) -> preguntar;
 * - sin producto parecido -> silencio, no «No encontré…»: el jefe no pidió nada.
 *
 * Sin Vue y sin datos: se prueba con `node --test` (`tests/vozDebil.test.js`).
 */
import { decidirProducto } from '../../../shared/voz/gramatica.js'

/** Señales que convierten una venta floja en una pregunta legítima. */
export const RAZONES_DEBILES = Object.freeze([
  'verbo_venta_debil',
  'verbo_venta_interior',
  'cantidad_y_producto'
])

/**
 * Por debajo de este puntaje el dictado no se parece a nada del catálogo:
 * preguntar «¿Quisiste vender bolsa?» solo estorba.
 */
const PUNTAJE_MINIMO_ACLARAR = 0.45

export function esRazonDebil(razones = []) {
  return RAZONES_DEBILES.includes(razones?.[0])
}

/**
 * Decide si una venta con señal débil se hace, se pregunta o se ignora.
 *
 * @param {object} opciones
 * @param {Array} opciones.candidatos filas ya puntuadas (`fuzzyMatchProducts`)
 * @param {number} opciones.umbral `UMBRAL_PRODUCTO`
 * @param {number} opciones.sttConfidence
 * @param {{nombre?: string, cantidad?: number}} [opciones.hint] para la pregunta
 * @returns {{tipo: 'vender'|'aclarar'|'ignorar', pregunta?: string}}
 */
export function decidirVentaDebil({ candidatos = [], umbral, sttConfidence = 0, hint = {} } = {}) {
  const lista = Array.isArray(candidatos) ? candidatos : []
  if (!lista.length) return { tipo: 'ignorar' }

  const decision = decidirProducto(lista, { umbral, sttConfidence })
  if (decision.elegido) return { tipo: 'vender' }

  // Hay algo parecido pero sin margen: preguntar es mejor que vender al azar.
  // Solo se pregunta si el parecido es razonable: «dame la bolsa» contra el
  // catálogo produce puntajes bajísimos y preguntar por ellos es ruido.
  const mejor = Number(lista[0]?.score) || 0
  if (decision.ambiguo && mejor >= PUNTAJE_MINIMO_ACLARAR) {
    const nombre = String(hint.nombre ?? '').trim()
    if (!nombre) return { tipo: 'ignorar' }
    const cantidad = Math.max(1, Math.trunc(Number(hint.cantidad) || 1))
    return { tipo: 'aclarar', pregunta: `¿Quisiste vender ${cantidad} ${nombre}?` }
  }

  return { tipo: 'ignorar' }
}
