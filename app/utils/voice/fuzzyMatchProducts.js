/**
 * app/utils/voice/fuzzyMatchProducts.js — Match tolerante de producto (puro).
 *
 * Se compara el `productoHint` contra el catálogo con tres niveles, de más a
 * menos fiable, para no confundir "pan" con "pan de leche" cuando existe "Pan":
 *
 *   1.0  igualdad exacta (incluye singular/plural: "panes" → "pan")
 *   0.88 contención ("pan" dentro de "pan de leche")
 *   0.80 coincidencia de una palabra suelta ("blanco" en "pan blanco")
 *   <0.8 similitud de Levenshtein
 *
 * Sin Vue y sin datos: se prueba con `node --test` (tests/voz.test.js).
 */

const PESO_CONTENCION = 0.88
const PESO_PALABRA = 0.8
const PESO_DESCRIPCION = 0.82
// Palabra suelta de la descripción: 0.9 si el nombre ya coincide (desempate);
// 0.7 si solo coincide la descripción (queda bajo el umbral: se pregunta).
const REFUERZO_DESCRIPCION = 0.9
const TOPE_SOLO_DESCRIPCION = 0.7

function normal(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalización fonética para habla cubana/STT: b/v, ll/y, z/s, h muda, q/k/c. */
export function fonetizar(texto) {
  let s = normal(texto)
  s = s.replace(/h/g, '')
  s = s.replace(/v/g, 'b')
  s = s.replace(/ll/g, 'y')
  s = s.replace(/z/g, 's')
  s = s.replace(/q/g, 'c')
  s = s.replace(/k/g, 'c')
  s = s.replace(/j/g, 'y')
  return s
}

/** Plural español → singular (heurística barata y suficiente para un catálogo). */
function singular(palabra) {
  if (palabra.length > 4 && palabra.endsWith('es')) return palabra.slice(0, -2)
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1)
  return palabra
}

function variantes(texto) {
  const base = normal(texto)
  if (!base) return []
  const sing = base.split(' ').map(singular).join(' ')
  const out = []
  const raw = sing === base ? [base] : [base, sing]
  for (const item of raw) {
    out.push(item)
    const fon = fonetizar(item)
    if (fon !== item && !out.includes(fon)) out.push(fon)
  }
  return out
}

function tokens(texto) {
  return normal(texto).split(' ').filter(t => t.length > 2)
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const v0 = new Array(b.length + 1)
  const v1 = new Array(b.length + 1)
  for (let i = 0; i <= b.length; i++) v0[i] = i
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v0[j + 1] + 1, v1[j] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]
  }
  return v1[b.length]
}

function puntuar(hint, nombre) {
  const variantesHint = variantes(hint)
  const variantesNombre = variantes(nombre)
  let mejor = { score: 0, distance: 999 }

  for (const h of variantesHint) {
    for (const n of variantesNombre) {
      if (!h || !n) continue

      if (h === n) return { score: 1, distance: 0 }

      // Contención solo si los largos son comparables: "pan" no debe puntuar
      // como "panqueque" solo por ser prefijo.
      const menor = Math.min(h.length, n.length)
      const mayor = Math.max(h.length, n.length)
      if ((h.includes(n) || n.includes(h)) && menor / mayor >= 0.6) {
        if (mejor.score < PESO_CONTENCION) mejor = { score: PESO_CONTENCION, distance: 0 }
      }

      const distance = levenshtein(h, n)
      const similitud = Math.max(0, 1 - distance / Math.max(h.length, n.length, 1))
      if (similitud > mejor.score) mejor = { score: similitud, distance }
    }
  }

  // "blanco" dentro de "pan blanco": coincidencia exacta de una palabra suelta.
  const tokensNombre = tokens(nombre)
  for (const token of tokens(hint)) {
    if (tokensNombre.includes(token) && mejor.score < PESO_PALABRA) {
      mejor = { score: PESO_PALABRA, distance: 0 }
    }
  }

  return mejor
}

/**
 * @param {string} productoHint
 * @param {Array<{id: string, name: string, canonicalSpeak?: string}>} catalogo
 * @returns {Array<{product: object, distance: number, score: number}>} top 3
 */
export function fuzzyMatchProducts(productoHint, catalogo) {
  const hint = normal(productoHint)
  if (!hint) return []

  const puntuados = (catalogo || [])
    .map((product) => {
      let mejor = { score: 0, distance: 999, matchedField: 'name' }
      let scoreNombre = 0

      const campos = [
        { value: product.name, field: 'name', peso: 1 },
        { value: product.canonicalSpeak, field: 'name', peso: 1 },
        { value: product.description ?? product.descripcion, field: 'description', peso: PESO_DESCRIPCION }
      ].filter(c => c.value)

      for (const campo of campos) {
        const p = puntuar(hint, campo.value)
        if (campo.field === 'name') scoreNombre = Math.max(scoreNombre, p.score)
        if (p.score * campo.peso > mejor.score) {
          mejor = {
            score: p.score * campo.peso,
            distance: p.distance,
            matchedField: campo.field
          }
        }
      }

      // Refuerzo por palabras sueltas de la descripción (lata/botella/paquete).
      // Solo desempata cuando el nombre ya coincide ("refresco lata"). Si el
      // nombre no coincide, la descripción nunca puede superar a un producto
      // cuyo nombre sí coincide: un "Hielo" con descripción "para refresco" no
      // debe ganarle a "Refresco Cola" cuando dices "refresco".
      const nombreCoincide = scoreNombre >= PESO_CONTENCION
      const tokensDescription = tokens(product.description ?? product.descripcion)
      for (const token of tokens(hint)) {
        if (!tokensDescription.includes(token)) continue
        const tope = nombreCoincide ? REFUERZO_DESCRIPCION : TOPE_SOLO_DESCRIPCION
        if (mejor.score < tope) {
          mejor = {
            score: tope,
            distance: mejor.distance,
            matchedField: 'description'
          }
        }
      }

      return { product, distance: mejor.distance, score: mejor.score, matchField: mejor.matchedField }
    })
    .filter(item => item.score > 0.13)

  puntuados.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.distance !== b.distance) return a.distance - b.distance
    return String(a.product.name ?? '').length - String(b.product.name ?? '').length
  })

  return puntuados.slice(0, 3)
}
