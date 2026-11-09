/**
 * app/utils/voice/confirmacion.js — Respuesta hablada al Modo PRO (puro).
 *
 * Solo se aceptan frases completas y conocidas. "sí pero no" o "sí tengo" no
 * confirman: en Modo PRO la venta se registra sin tocar el dispositivo, así que
 * un falso positivo cuesta dinero. Ante la duda, se cae al fallback manual.
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
  'claro',
  'claro que si',
  'vale',
  'ok',
  'okay',
  'dale',
  'adelante',
  'correcto',
  'confirmo',
  'confirmar',
  'exacto',
  'eso es',
  'asi es',
  'de acuerdo',
  'perfecto',
  'listo'
])

const NEGATIVAS = new Set([
  'no',
  'no por favor',
  'no gracias',
  'mejor no',
  'asi no',
  'cancela',
  'cancelar',
  'espera',
  'detente',
  'para',
  'nada'
])

// Palabras que pueden acompañar a un "sí"/"no" sin cambiar el sentido.
const RELLENO_SI = new Set(['por', 'favor', 'claro', 'senor', 'senora', 'gracias', 'pues', 'que', 'si'])
const RELLENO_NO = new Set(['por', 'favor', 'gracias', 'espera', 'mejor', 'asi', 'nada', 'cancela', 'cancelar', 'detente', 'para', 'no'])

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

export function esAfirmacion(texto) {
  const t = tokens(texto)
  if (!t.length) return false
  if (AFIRMATIVAS.has(t.join(' '))) return true
  return t[0] === 'si' && t.slice(1).every(x => RELLENO_SI.has(x))
}

export function esNegacion(texto) {
  const t = tokens(texto)
  if (!t.length) return false
  if (NEGATIVAS.has(t.join(' '))) return true
  return t[0] === 'no' && t.slice(1).every(x => RELLENO_NO.has(x))
}
