/**
 * app/utils/voice/confirmacion.js — Respuesta hablada a la confirmación (puro).
 *
 * Solo se aceptan frases completas y conocidas. "sí pero no" o "sí tengo" no
 * confirman: la venta se registra sin tocar el dispositivo, así que un falso
 * positivo cuesta dinero. Ante la duda, se cae al fallback manual.
 *
 * Sin Vue y sin datos: se prueba con `node --test` (tests/voz.test.js).
 */
import { normalizar } from '../../../shared/voz/gramatica.js'

const AFIRMATIVAS = new Set([
  'si',
  'si por favor',
  'si claro',
  'si senor',
  'si senora',
  'si dale',
  'si esta bien',
  'si asi es',
  'si correcto',
  'si exacto',
  'claro',
  'claro que si',
  'por supuesto',
  'vale',
  'ok',
  'okay',
  'dale',
  'dale pues',
  'adelante',
  'correcto',
  'confirmo',
  'confirmar',
  'exacto',
  'eso es',
  'asi es',
  'de acuerdo',
  'perfecto',
  'listo',
  'anotala',
  'anotelo'
])

const NEGATIVAS = new Set([
  'no',
  'no por favor',
  'no gracias',
  'no senor',
  'no senora',
  'no asi',
  'no asi no',
  'mejor no',
  'asi no',
  'negativo',
  'cancela',
  'cancela eso',
  'cancelar',
  'espera',
  'esperate',
  'detente',
  'para',
  'nada',
  'dejalo',
  'dejala'
])

// Palabras que pueden acompañar a un "sí"/"no" sin cambiar el sentido.
const RELLENO_SI = new Set([
  'por', 'favor', 'claro', 'senor', 'senora', 'gracias', 'pues', 'que', 'si',
  'dale', 'esta', 'bien', 'todo', 'correcto', 'exacto', 'asi', 'es', 'eso',
  'perfecto', 'listo', 'adelante', 'supuesto'
])
const RELLENO_NO = new Set([
  'por', 'favor', 'gracias', 'espera', 'esperate', 'mejor', 'asi', 'nada',
  'cancela', 'cancelar', 'detente', 'para', 'no', 'senor', 'senora', 'dejalo',
  'dejala', 'eso', 'negativo'
])

function tokens(texto) {
  const salida = []
  for (const token of normalizar(texto).split(' ')) {
    if (!token) continue
    // "sí sí" / "no no" → una sola palabra.
    if (salida.length && salida[salida.length - 1] === token) continue
    salida.push(token)
  }
  return salida
}

/** Primeras palabras que abren una afirmación ("sí, claro"; "dale, pues"). */
const INICIO_SI = new Set([
  'si', 'claro', 'vale', 'ok', 'okay', 'dale', 'correcto', 'exacto', 'confirmo',
  'confirmar', 'adelante', 'perfecto', 'listo', 'anotala', 'anotelo'
])

/**
 * Primeras palabras que abren una negación. «mejor» solo niega al inicio
 * («mejor no»): en medio de la frase no decide nada.
 */
const INICIO_NO = new Set([
  'no', 'cancela', 'cancelar', 'espera', 'esperate', 'detente', 'para', 'nada',
  'negativo', 'dejalo', 'dejala'
])

/**
 * Afirmación tolerante al STT: la primera palabra es un «sí» y el resto es
 * relleno conocido. "sí señor", "sí, está bien" y "dale, pues" confirman; "sí
 * pero no" no (el «pero» rompe la regla, igual que antes).
 */
export function esAfirmacion(texto) {
  const t = tokens(texto)
  if (!t.length) return false
  if (AFIRMATIVAS.has(t.join(' '))) return true
  const arranque = t[0] === 'por' && t[1] === 'supuesto' ? 'por supuesto' : t[0]
  if (!INICIO_SI.has(arranque)) return false
  const resto = arranque === 'por supuesto' ? t.slice(2) : t.slice(1)
  return resto.every(x => RELLENO_SI.has(x))
}

export function esNegacion(texto) {
  const t = tokens(texto)
  if (!t.length) return false
  if (NEGATIVAS.has(t.join(' '))) return true
  if (t[0] === 'mejor') {
    return t.slice(1).every(x => RELLENO_NO.has(x) || x === 'no')
  }
  if (!INICIO_NO.has(t[0])) return false
  return t.slice(1).every(x => RELLENO_NO.has(x))
}

/**
 * Clasifica una respuesta hablada en una sola categoría.
 *
 * - `vacio`: no se capturó texto (aún).
 * - `negado` / `afirmado`: respuestas claras.
 * - `otro`: se escuchó algo, pero no confirma ni cancela.
 *
 * Se usa en la espera de confirmación hablada para no
 * repetir la lógica de sí/no en cada flujo.
 */
export function clasificarRespuesta(texto) {
  if (!tokens(texto).length) return 'vacio'
  if (esNegacion(texto)) return 'negado'
  if (esAfirmacion(texto)) return 'afirmado'
  return 'otro'
}
