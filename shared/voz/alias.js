/**
 * shared/voz/alias.js — alias de producto aprendidos (puro).
 *
 * Un alias es una palabra o frase que el mostrador usa para un producto del
 * catálogo («bombi» → Bombillo LED). Se aprende solo cuando el jefe elige el
 * producto a mano (menú de candidatos o «Asignar producto») y nunca sustituye
 * la confirmación ni el control de stock: solo mejora el emparejamiento.
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */
import { normalizar } from './gramatica.js'
import { LEXICO_BASE } from './lexico.js'

export const MAX_ALIAS_POR_PRODUCTO = 5
export const LARGO_MIN_ALIAS = 3
export const LARGO_MAX_ALIAS = 24

const NUMEROS = new Set([
  'cero', 'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete',
  'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'treinta',
  'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa',
  'cien', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos', 'mil', 'docena', 'docenas'
])

/** Palabras que no pueden ser un alias: son gramática, no producto. */
const RESERVADAS = new Set([
  // Todo el vocabulario base (venta, fiado, cobro, inventario, consultas…).
  ...Object.values(LEXICO_BASE).flat(),
  'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'sin', 'en', 'al', 'para', 'por', 'favor', 'gracias',
  'quiosco', 'kiosco', 'almacen', 'deposito',
  'caja', 'total', 'hoy', 'ayer', 'dia', 'semana', 'mes',
  'deuda', 'deudas', 'fiado', 'fiados',
  'regalo', 'casa', 'familiar', 'normal', 'cliente', 'clientes',
  'fia', 'fiale', 'fiar', 'fias', 'fiame', 'cobra', 'cobrame', 'cobrale',
  'abona', 'aboname', 'paga', 'pagame', 'pago', 'pague',
  'repite', 'repitelo', 'ayuda', 'que', 'como', 'cuanto', 'cuanta', 'cuantos', 'cuantas'
])

const RESERVADAS_POR_TOKEN = RESERVADAS

/**
 * Marcas de gramática que no forman parte del nombre de un producto. Se
 * comparan como secuencia de palabras para no rechazar nombres legítimos que
 * contienen una palabra suelta.
 *
 * El dueño comprobó que alias como «maní como venta» o «azúcar al kiosco»
 * arrastraban la etiqueta del comando y no servían para nada.
 */
const MARCAS_GRAMATICA = [
  ['como', 'venta'],
  ['venta', 'familiar'],
  ['de', 'casa'],
  ['de', 'regalo'],
  ['regalo'],
  ['al', 'kiosco'],
  ['al', 'quiosco'],
  ['al', 'almacen'],
  ['al', 'deposito'],
  ['para', 'el'],
  ['para', 'la'],
  ['pal', 'kiosco'],
  ['pal', 'quiosco']
]

/** Forma canónica del alias: sin tildes, minúsculas y espacios colapsados. */
export function normalizarAlias(texto) {
  return normalizar(texto)
}

function tokensDe(texto) {
  const t = normalizarAlias(texto)
  return t ? t.split(' ').filter(Boolean) : []
}

function contieneSecuenciaDePalabras(tokens, secuencia) {
  if (!secuencia.length || secuencia.length > tokens.length) return false
  for (let i = 0; i + secuencia.length <= tokens.length; i++) {
    let igual = true
    for (let j = 0; j < secuencia.length; j++) {
      if (tokens[i + j] !== secuencia[j]) {
        igual = false
        break
      }
    }
    if (igual) return true
  }
  return false
}

/** Singular tosco, el mismo criterio que usa el emparejador de productos. */
function singularizarToken(token) {
  const t = String(token ?? '')
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1)
  return t
}

function singularizarFrase(frase) {
  return tokensDe(frase).map(singularizarToken).join(' ')
}

/**
 * ¿El alias junta varios productos con «y»? Eso es una venta sin segmentar
 * («huevos un jugo y un paquete de ref»), no el nombre de uno solo.
 */
function tieneVariosProductos(tokens) {
  if (!tokens.includes('y')) return false
  const tramos = []
  let desde = 0
  tokens.forEach((token, i) => {
    if (token !== 'y') return
    tramos.push(tokens.slice(desde, i))
    desde = i + 1
  })
  tramos.push(tokens.slice(desde))
  const conProducto = tramos.filter(tramo =>
    tramo.some(t => !RESERVADAS_POR_TOKEN.has(t) && !NUMEROS.has(t)))
  return conProducto.length > 1
}

/**
 * ¿Merece la pena aprender este texto para un producto?
 *
 * Se rechaza lo que es pura gramática («de la», «dos»), lo que ya resuelve el
 * catálogo (el nombre del producto o su nombre con la descripción), lo que
 * arrastra una marca de comando («como venta», «al kiosco»), lo que junta
 * varios productos y lo demasiado corto o largo.
 *
 * @param {string} texto
 * @param {object} opciones
 * @param {string[]} [opciones.nombresProductos] nombres de TODO el catálogo
 * @param {string[]} [opciones.nombresCompletos] nombre + descripción del catálogo
 */
export function esAliasValido(texto, { nombresProductos = [], nombresCompletos = [] } = {}) {
  const frase = normalizarAlias(texto)
  if (frase.length < LARGO_MIN_ALIAS || frase.length > LARGO_MAX_ALIAS) return false
  if (!/^[a-z0-9 ]+$/.test(frase)) return false

  const tokens = tokensDe(frase)
  const utiles = tokens.filter(t => !RESERVADAS_POR_TOKEN.has(t) && !NUMEROS.has(t))
  if (!utiles.length) return false
  if (utiles.every(t => t.length < 3)) return false

  // Etiqueta de comando pegada al nombre: no es forma de llamar al producto.
  if (MARCAS_GRAMATICA.some(marca => contieneSecuenciaDePalabras(tokens, marca))) return false

  // Dos o más productos unidos por «y»: no es alias de uno solo.
  if (tieneVariosProductos(tokens)) return false

  // El catálogo ya resuelve esto: nombre oficial, o nombre + descripción.
  // También se rechaza el plural mal formado de ese nombre («maní molidos»).
  const nombres = [...(nombresProductos ?? []), ...(nombresCompletos ?? [])]
    .map(nombre => normalizarAlias(nombre))
    .filter(Boolean)
  const singular = singularizarFrase(frase)
  return !nombres.some(nombre => nombre === frase || singularizarFrase(nombre) === singular)
}

/**
 * Alias guardados que las reglas de hoy ya no aceptarían. La pantalla de
 * administración los muestra antes de borrarlos: nada se borra solo.
 */
export function aliasesQueSobran(aliases = [], { nombresProductos = [], nombresCompletos = [] } = {}) {
  return (aliases ?? []).filter(a =>
    a?.texto && !esAliasValido(a.texto, { nombresProductos, nombresCompletos }))
}

/**
 * Parte de un dictado lo que puede ser alias: quita el verbo, la cantidad y el
 * cliente de un fiado, y conserva las partículas internas («pan de la casa»).
 */
export function textoParaAlias(frase) {
  const tokens = tokensDe(frase)
  let i = 0
  while (i < tokens.length && (RESERVADAS_POR_TOKEN.has(tokens[i]) || NUMEROS.has(tokens[i]))) i++
  const resto = tokens.slice(i)
  const idxCliente = resto.findIndex(t => t === 'a' || t === 'para')
  const producto = idxCliente > 0 ? resto.slice(0, idxCliente) : resto
  return producto.join(' ').slice(0, LARGO_MAX_ALIAS).trim()
}

/** Raíz tosca para tolerar plurales: «bombis» ~ «bombi», «panes» ~ «pan». */
function raiz(token) {
  const t = String(token ?? '')
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1)
  return t
}

/** ¿La secuencia de tokens del alias aparece completa en el hint? */
function contieneSecuencia(hintTokens, aliasTokens) {
  if (!aliasTokens.length || aliasTokens.length > hintTokens.length) return false
  for (let i = 0; i + aliasTokens.length <= hintTokens.length; i++) {
    let igual = true
    for (let j = 0; j < aliasTokens.length; j++) {
      if (raiz(hintTokens[i + j]) !== raiz(aliasTokens[j])) {
        igual = false
        break
      }
    }
    if (igual) return true
  }
  return false
}

/** ¿El texto dicho contiene el alias como palabras completas? */
export function aliasCoincide(hint, texto) {
  return contieneSecuencia(tokensDe(hint), tokensDe(texto))
}

/**
 * Sube la puntuación del producto cuyo alias aparece en el hint.
 *
 * El alias vale como coincidencia casi exacta (1.0), pero el resultado sigue
 * pasando por el umbral, el margen y la confirmación: un alias nunca vende solo.
 *
 * @param {Array<{ row: object, score: number }>} candidatos
 * @param {string} hint
 * @param {Array<{ texto: string, productoId: string }>} aliases
 */
export function aplicarAlias(candidatos, hint, aliases = []) {
  const lista = Array.isArray(candidatos) ? candidatos : []
  if (!lista.length || !aliases?.length) return lista

  const hintTokens = tokensDe(hint)
  if (!hintTokens.length) return lista

  const porProducto = new Map()
  for (const alias of aliases) {
    const aliasTokens = tokensDe(alias?.texto)
    if (!contieneSecuencia(hintTokens, aliasTokens)) continue
    const id = String(alias?.productoId ?? '')
    if (!id) continue
    // El alias más largo gana si dos apuntan al mismo producto.
    const largo = aliasTokens.join(' ').length
    if (largo > (porProducto.get(id) ?? 0)) porProducto.set(id, largo)
  }
  // El mismo texto apuntando a dos productos es un conflicto: no se adivina.
  if (porProducto.size !== 1) return lista

  return lista
    .map((c) => {
      const id = String(c?.row?.productoId ?? c?.row?.id ?? '')
      if (!porProducto.has(id)) return c
      return { ...c, score: Math.max(1, Number(c?.score) || 0), alias: true }
    })
    .sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0))
}

/**
 * Coloca un alias nuevo en la lista de un producto respetando el tope: si se
 * pasa, se descarta el menos usado (y el más antiguo entre iguales).
 */
export function agregarAliasConTope(aliases = [], nuevo, { maximo = MAX_ALIAS_POR_PRODUCTO } = {}) {
  const lista = [...(aliases ?? [])]
  const delProducto = lista
    .filter(a => a.productoId === nuevo.productoId)
    .sort((a, b) => (Number(a.aciertos) || 0) - (Number(b.aciertos) || 0)
      || (Number(a.creadoEn) || 0) - (Number(b.creadoEn) || 0))

  const sobrantes = delProducto.length + 1 - maximo
  const quitar = new Set(sobrantes > 0 ? delProducto.slice(0, sobrantes).map(a => a.id) : [])
  return [...lista.filter(a => !quitar.has(a.id)), nuevo]
}
