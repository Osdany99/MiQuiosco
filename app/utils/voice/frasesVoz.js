/**
 * Frases habladas de la venta por voz.
 *
 * El motor TTS lee "1 Pan" como "uno pan" y "2 Pan" como "dos pan": hay que
 * construir la concordancia nosotros. Sin dependencias para poder probarlo.
 */

// Sustantivos femeninos que no terminan en -a.
const FEMENINAS = new Set([
  'leche', 'sal', 'miel', 'carne', 'nuez', 'sangre', 'crema', 'mantequilla',
  'torre', 'fuente', 'llave', 'clave', 'flor', 'col', 'sopa', 'luz'
])
// Masculinos que terminan en -a (o suenan a ello).
const MASCULINAS_A = new Set(['mapa', 'dia', 'planeta', 'tema', 'sofa', 'idioma', 'agua'])

function sinTildes(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Primera palabra del nombre, en minúsculas y sin tildes ("Pan Blanco" → "pan"). */
function nucleo(nombre) {
  return sinTildes(String(nombre ?? '').trim().toLowerCase()).split(/\s+/)[0] || ''
}

/** 'un' | 'una' | null (null = no se puede decidir con seguridad). */
export function articuloIndefinido(nombre) {
  const p = nucleo(nombre)
  if (!p) return null
  // Nombre en plural ("Galletas María"): no hay artículo singular fiable.
  if (p.length > 3 && p.endsWith('s') && !p.endsWith('ss')) return null
  if (MASCULINAS_A.has(p)) return 'un'
  if (FEMENINAS.has(p)) return 'una'
  if (p.endsWith('a') || /(cion|sion|dad|tad|tud|umbre)$/.test(p)) return 'una'
  return 'un'
}

/** "una unidad de Pan" / "3 unidades de Pan". */
export function unidadesDe(cantidad, nombre) {
  const n = Math.trunc(Number(cantidad) || 0)
  const base = String(nombre ?? '').trim() || 'ese producto'
  return n === 1 ? `una unidad de ${base}` : `${n} unidades de ${base}`
}

/** "un Pan", "una Cerveza" o "3 unidades de Pan". */
export function describirCantidad(cantidad, nombre) {
  const n = Math.trunc(Number(cantidad) || 0)
  const base = String(nombre ?? '').trim() || 'producto'
  if (n === 1) {
    const art = articuloIndefinido(base)
    return art ? `${art} ${base}` : unidadesDe(1, base)
  }
  return unidadesDe(n, base)
}

/** Frase del read-back antes de vender. */
export function fraseVenta({ cantidad, nombre, lugar }) {
  const n = Math.trunc(Number(cantidad) || 0)
  if (n < 1) return `Confirma la venta del ${lugar}.`
  return `Voy a vender ${describirCantidad(n, nombre)} del ${lugar}.`
}

/** Aviso cuando piden más de lo que hay. */
export function fraseStockInsuficiente({ disponible, nombre, lugar }) {
  const base = String(nombre ?? '').trim() || 'ese producto'
  const n = Math.trunc(Number(disponible) || 0)
  if (n <= 0) return `No hay ${base} en el ${lugar}.`
  return `Solo hay ${unidadesDe(n, base)} en el ${lugar}.`
}

export const FRASE_CONFIRMAR = 'Diga sí para confirmar.'
