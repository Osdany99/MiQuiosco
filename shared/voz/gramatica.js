/**
 * shared/voz/gramatica.js — Intérprete de comandos de voz (puro).
 *
 * Contrato de dos fases, obligatorio para poder añadir comandos sin romper los
 * existentes:
 *
 *   1. resolverComando(transcript) → { comando, confianza, reasons }
 *   2. extraerSlots(comando, transcript) → slots
 *
 * Sin Vue, sin red y sin acceso a datos: se prueba con `node --test`
 * (tests/voz.test.js). Añadir un comando aquí NO puede tocar los slots de otro.
 *
 * La voz nunca escribe: solo produce una intención y sus slots. Quien decide
 * abrir un formulario prellenado es la capa de UI.
 */
import { LEXICO_BASE } from './lexico.js'

const UNIDADES = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9
}

const DECENAS = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90
}

const CENTENAS = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900
}

const NUM_WORDS = { ...UNIDADES, ...DECENAS, ...CENTENAS }

const VERBOS_VENTA = [
  'vende',
  'vendeme',
  'vendemelo',
  'vendes',
  'vendan',
  'vender',
  'vendo',
  'vendio',
  'vendieron',
  'vendimos',
  'vendiste',
  'anota',
  'anotame',
  'anotamelo',
  'registra',
  'registrame',
  'saca',
  'sacame',
  'despacha',
  'despachame',
  'vendele',
  'cobra',
  'cobrame',
  'cobrale',
  'apunta',
  'apuntame'
]

// Verbos que piden cualquier cosa ("dame el total del día"). Solo cuentan como
// venta si la frase no es una consulta ni una navegación (ver resolverComando).
const VERBOS_VENTA_DEBILES = ['dame', 'damelo', 'ponme', 'ponmelo', 'pon']

// (regex de verbos se compila en `compilar()` según el léxico)

const PALABRAS_VACIAS = new Set([
  'de',
  'del',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'que',
  'lo',
  'por',
  'favor',
  'y'
])

const ARTICULOS_INICIALES = /^(?:(?:de|del|el|la|los|las|un|una|unos|unas|que|lo)\s+)+/

// Palabras que nunca forman parte de un nombre de cliente. Evita que frases
// como "para llevar" o "para mi" se confundan con una persona.
const PALABRAS_NO_CLIENTE = new Set([
  'llevar',
  'regalar',
  'comer',
  'probar',
  'aqui',
  'aca',
  'hoy',
  'manana',
  'todos',
  'todas',
  'mi',
  'mis',
  'tu',
  'tus'
])

// Preposiciones/artículos que quedan sueltos al quitar ubicación, tipo o
// cliente. Solo se limpian en los bordes para no romper nombres compuestos
// ("pan de leche").
const BORDE_VACIAS = new Set([...PALABRAS_VACIAS, 'para', 'desde', 'en', 'al', 'con', 'sin'])

function limpiarBordes(tokens) {
  while (tokens.length && BORDE_VACIAS.has(tokens[0])) tokens.shift()
  while (tokens.length && BORDE_VACIAS.has(tokens[tokens.length - 1])) tokens.pop()
  return tokens
}

/** Umbral de match de producto. Configurable por puesto en una fase posterior. */
export const UMBRAL_PRODUCTO = 0.75

/**
 * Normaliza para comparar: minúsculas, sin acentos (la ñ pasa a n), sin
 * puntuación y con espacios simples.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Se conservan . y , hasta resolver los decimales ("1,5" → "1.5"); el resto
    // de la puntuación se convierte en espacio.
    .replace(/[^a-z0-9\s.,]/g, ' ')
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Número a partir de un token: dígitos (con decimales) o palabra española. */
export function parseNumberToken(token) {
  const tok = normalizar(token)
  if (!tok) return null
  if (/^\d+(?:\.\d+)?$/.test(tok)) return Number(tok)
  if (Object.prototype.hasOwnProperty.call(NUM_WORDS, tok)) return NUM_WORDS[tok]
  return null
}

const DOCENAS = new Set(['docena', 'docenas'])
const MONEDAS = new Set(['peso', 'pesos', 'cup', 'mn'])
const ARTICULO_NUMERO = new Set(['un', 'una', 'uno'])

/** Lectura segura de un mapa: evita que "constructor" o similares cuenten como número. */
function enMapa(mapa, clave) {
  return Object.prototype.hasOwnProperty.call(mapa, clave) ? mapa[clave] : undefined
}

/**
 * Número menor que mil que empieza en `inicio`: dígitos, o palabras como
 * "treinta y cinco" / "ciento veinte". Devuelve `{ valor, consumidos }` o null.
 */
function numeroMenorQueMil(tokens, inicio) {
  const tokenEn = i => normalizar(tokens[i])
  const primero = tokenEn(inicio)
  if (!primero) return null
  if (/^\d+(?:\.\d+)?$/.test(primero)) return { valor: Number(primero), consumidos: 1 }

  const centena = enMapa(CENTENAS, primero)
  if (centena !== undefined) {
    let valor = centena
    let i = inicio + 1
    const decena = enMapa(DECENAS, tokenEn(i))
    const unidadSuelta = enMapa(UNIDADES, tokenEn(i))

    if (decena !== undefined && decena >= 30) {
      valor += decena
      i++
      if (tokenEn(i) === 'y') {
        const unidad = enMapa(UNIDADES, tokenEn(i + 1))
        if (unidad !== undefined && unidad > 0) {
          valor += unidad
          i += 2
        }
      }
    } else if (decena !== undefined || unidadSuelta !== undefined) {
      valor += decena ?? unidadSuelta
      i++
    }

    return { valor, consumidos: i - inicio }
  }

  const decena = enMapa(DECENAS, primero)
  if (decena !== undefined && decena >= 30) {
    let valor = decena
    let i = inicio + 1
    if (tokenEn(i) === 'y') {
      const unidad = enMapa(UNIDADES, tokenEn(i + 1))
      if (unidad !== undefined && unidad > 0) {
        valor += unidad
        i += 2
      }
    }
    return { valor, consumidos: i - inicio }
  }

  const unidad = enMapa(UNIDADES, primero)
  if (decena !== undefined || unidad !== undefined) {
    return { valor: decena ?? unidad, consumidos: 1 }
  }

  return null
}

/**
 * Número compuesto a partir de una secuencia de tokens: "treinta y cinco" → 35,
 * "ciento veinte" → 120, "doscientos cincuenta y cinco" → 255, "dos mil
 * quinientos" → 2500, "mil" → 1000.
 *
 * Devuelve `{ valor, consumidos }` para que el extractor sepa cuántos tokens
 * retirar; `null` si la secuencia no empieza por un número.
 */
export function parseNumberSequence(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return null
  const tokenEn = i => normalizar(tokens[i])

  if (tokenEn(0) === 'mil') {
    const resto = numeroMenorQueMil(tokens, 1)
    return { valor: 1000 + (resto?.valor ?? 0), consumidos: 1 + (resto?.consumidos ?? 0) }
  }

  const base = numeroMenorQueMil(tokens, 0)
  if (!base) return null

  if (tokenEn(base.consumidos) === 'mil') {
    const inicioResto = base.consumidos + 1
    const resto = numeroMenorQueMil(tokens, inicioResto)
    return {
      valor: base.valor * 1000 + (resto?.valor ?? 0),
      consumidos: inicioResto + (resto?.consumidos ?? 0)
    }
  }

  return base
}

/**
 * Fase A — clasificación.
 *
 * Regla: manda el verbo de acción. Si no hay verbo, solo se acepta una venta
 * cuando hay una cantidad explícita y algo más (contexto de inventario), que es
 * el caso "cinco panes" pulsa-y-habla desde /quiosco.
 *
 * Los verbos "débiles" ("dame", "ponme") sirven para pedir muchas cosas ("dame
 * el total del día"), así que solo cuentan como venta cuando la frase no parece
 * una consulta ni una navegación.
 */
const CACHE_COMPILADO = new WeakMap()

function compilar(lexico) {
  const clave = lexico ?? LEXICO_BASE
  const cached = CACHE_COMPILADO.get(clave)
  if (cached) return cached
  const ventaFuerte = Array.isArray(clave?.ventaFuerte) ? clave.ventaFuerte : VERBOS_VENTA
  const ventaDebil = Array.isArray(clave?.ventaDebil) ? clave.ventaDebil : VERBOS_VENTA_DEBILES
  const navVerbo = Array.isArray(clave?.navegacionVerbo) ? clave.navegacionVerbo : null
  const destinos = (clave?.destinos && typeof clave.destinos === 'object') ? clave.destinos : null
  const consultaMarca = Array.isArray(clave?.consultaMarca) ? clave.consultaMarca : null

  const out = {
    ventaFuerte,
    ventaDebil,
    navegacionVerbo: navVerbo,
    destinos,
    consultaMarca,
    PREFIJO_VENTA: new RegExp(`^(${ventaFuerte.join('|')})\\b`),
    PREFIJO_VENTA_DEBIL: new RegExp(`^(${ventaDebil.join('|')})\\b`),
    PREFIJO_VENTA_CUALQUIERA: new RegExp(`^(${[...ventaFuerte, ...ventaDebil].join('|')})\\b`),
    VERBO_VENTA: new RegExp(`\\b(${ventaFuerte.join('|')})\\b`)
  }
  CACHE_COMPILADO.set(clave, out)
  return out
}

function resolverNavegacionPuro(texto, c, lexico) {
  const RELLENOS_NAV = new Set(['a', 'al', 'la', 'el', 'los', 'las', 'de', 'del', 'mi', 'mis', 'por', 'favor', 'pantalla', 'vista', 'seccion', 'modulo', 'en', 'ya', 'ahora', 'me'])
  const RELLENOS_COMPLEMENTO = new Set(['hoy', 'dia', 'ayer', 'actual'])
  const tokens = texto.split(' ').filter(Boolean)
  const verboIdx = tokens.findIndex(t => c.navegacionVerbo.map(x => x).includes(t))
  if (verboIdx < 0) return false

  // inverted map word -> vista key
  const inverted = {}
  if (c.destinos) {
    for (const [key, palabras] of Object.entries(c.destinos)) {
      for (const w of palabras) inverted[w] = key
    }
  }
  // also from lexicon BASE strings in lexico.destinos? yes c.destinos.

  let i = verboIdx + 1
  while (i < tokens.length && RELLENOS_NAV.has(tokens[i])) i++
  if (i >= tokens.length) return false
  const destino = inverted[tokens[i]]
  if (!destino) return false
  i++

  // resto solo rellenos nav o complemento
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j]
    if (RELLENOS_NAV.has(t)) continue
    if (RELLENOS_COMPLEMENTO.has(t)) continue
    if (lexico?.navegacionComplemento && lexico.navegacionComplemento.includes(t)) continue
    return false
  }
  return true
}

function extraerConsultaPura(texto) {
  const RELLENOS_CONSULTA = new Set(['unidades', 'unidad', 'dime', 'dame', 'decir', 'dices', 'cual', 'cuales', 'es', 'son', 'esta', 'estan', 'me', 'nos'])
  let work = texto

  // Ubicación propia (duplicada; no tocar extraerBase)
  const loc = work.match(/\b(?:desde|del|de|en|al)\s+(?:el\s+|la\s+)?(kiosco|quiosco|almacen)\b/)
  let ubicacion = null
  if (loc) {
    ubicacion = loc[1] === 'almacen' ? 'almacen' : 'quiosco'
    work = work.replace(loc[0], ' ')
  }

  const toks = work.split(' ').filter(Boolean)
  const marcaSet = new Set(['cuanto', 'cuanta', 'cuantos', 'cuantas', 'hay', 'queda', 'quedan', 'stock', 'existencia', 'existencias', 'tenemos', 'tengo', 'disponible', 'disponibles', 'inventario'])
  const filtrados = toks.filter(t => !marcaSet.has(t) && !RELLENOS_CONSULTA.has(t))
  // limpiar bordes
  while (filtrados.length && ['de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'desde', 'en', 'al', 'con', 'sin'].includes(filtrados[0])) filtrados.shift()
  while (filtrados.length && ['de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'desde', 'en', 'al', 'con', 'sin'].includes(filtrados[filtrados.length - 1])) filtrados.pop()
  let productoHint = filtrados.join(' ')
  productoHint = productoHint.replace(/^(?:(?:de|del|el|la|los|las|un|una|unos|unas|que|lo)\s+)+/, '').trim()
  return { productoHint, ubicacion }
}

/**
 * Fase A — clasificación.
 */
export function resolverComando(transcript, lexico = LEXICO_BASE) {
  const c = compilar(lexico)
  const texto = normalizar(transcript)
  if (!texto) return { comando: 'desconocido', confianza: 0, reasons: ['sin_texto'] }

  if (c.PREFIJO_VENTA.test(texto)) {
    return { comando: 'venta_directa', confianza: 0.95, reasons: ['verbo_venta'] }
  }

  // Navegación primero (exige verbo + destino).
  if (c.navegacionVerbo && c.destinos && resolverNavegacionPuro(texto, c, lexico)) {
    return { comando: 'navegacion', confianza: 0.9, reasons: ['navegacion_destino'] }
  }

  // Consulta: marcas presentes.
  if (/\bcuanto\b|\bcuanta\b|\bcuantos\b|\bcuantas\b|\bstock\b|\bexistencia(s)?\b|\binventario\b|\btenemos\b|\btengo\b|\bdisponible(s)?\b|\bhay\b|\bqueda(n)?\b/.test(texto)) {
    if (/\bcuesta\b|\bcuestan\b|\bprecio\b|\bprecios\b|\bvale\b|\bvalen\b|\bdebe\b|\bdeben\b|\bdeuda\b|\bdeudas\b|\bvendi\b|\bvendimos\b|\bvendido(s)?\b|\bganancia(s)?\b|\bgane\b|\btotal\b|\bcaja\b/.test(texto)) {
      return { comando: 'desconocido', confianza: 0, reasons: ['consulta_no_soportada'] }
    }
    const slots = extraerConsultaPura(texto)
    if (slots.productoHint) {
      return { comando: 'consulta_stock', confianza: 0.9, reasons: ['consulta_producto'] }
    }
    return { comando: 'desconocido', confianza: 0, reasons: ['consulta_sin_producto'] }
  }

  if (c.PREFIJO_VENTA_DEBIL.test(texto) && texto.split(' ').length > 1) {
    return { comando: 'venta_directa', confianza: 0.85, reasons: ['verbo_venta_debil'] }
  }

  if (c.VERBO_VENTA.test(texto)) {
    return { comando: 'venta_directa', confianza: 0.8, reasons: ['verbo_venta_interior'] }
  }

  const tokens = texto.split(' ').filter(Boolean)
  const conCantidad = tokens.some(t => !PALABRAS_VACIAS.has(t) && parseNumberToken(t) != null)
  const conProducto = tokens.some(t => !PALABRAS_VACIAS.has(t) && parseNumberToken(t) == null)
  if (conCantidad && conProducto) {
    return { comando: 'venta_directa', confianza: 0.6, reasons: ['cantidad_y_producto'] }
  }

  return { comando: 'desconocido', confianza: 0, reasons: ['sin_comando'] }
}

/**
 * Precio unitario dicho en voz: "a precio de diez", "a 10 pesos", "a diez cada
 * uno" o "a diez" al final de la frase. Trabaja sobre tokens ya normalizados.
 *
 * Un número suelto tras "a" solo cuenta como precio si la frase lo confirma
 * (moneda, "cada uno", "a precio de" o final de frase); "a 3 amigos" o "a un
 * cliente" no lo son. Devuelve `{ valor, desde, hasta }` o null.
 */
function parsearPrecio(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'a') continue

    let j = i + 1
    const explicito = tokens[j] === 'precio' && tokens[j + 1] === 'de'
    if (explicito) j += 2

    const numero = parseNumberSequence(tokens.slice(j))
    if (!numero) continue

    let fin = j + numero.consumidos
    let confirmado = explicito

    if (MONEDAS.has(tokens[fin])) {
      fin++
      confirmado = true
    }
    if (tokens[fin] === 'cada' && (tokens[fin + 1] === 'uno' || tokens[fin + 1] === 'una')) {
      fin += 2
      confirmado = true
    } else if (tokens[fin] === 'la' && tokens[fin + 1] === 'unidad') {
      fin += 2
      confirmado = true
    }
    if (fin >= tokens.length && !ARTICULO_NUMERO.has(tokens[j])) confirmado = true

    if (!confirmado) continue
    return { valor: numero.valor, desde: i, hasta: fin }
  }
  return null
}

/**
 * Extracción de slots de `venta_directa`.
 *
 * `conservarSuelto` decide qué hacer con las palabras de tipo de venta que
 * vienen sueltas ("familiar", "regalo", "casa", "normal"): pueden ser el tipo
 * de venta ("vende un pan regalo") o parte del nombre del producto ("refresco
 * familiar"). Con `false` se interpretan como tipo y se quitan del producto;
 * con `true` se dejan en el producto. Devuelve también `suelto`, que indica si
 * hubo alguna palabra ambigua.
 */
/**
 * Recorta el verbo de venta de la frase. Si el verbo está al inicio, quita el
 * prefijo (comportamiento original). Si el verbo aparece en otra posición,
 * descarta lo anterior y devuelve lo que viene después ("me vendes 3 panes" →
 * "3 panes"). Sin verbo devuelve el texto sin cambios ("cinco panes").
 */
function recortarVerbo(texto, ventaFuerte = VERBOS_VENTA, ventaDebil = VERBOS_VENTA_DEBILES) {
  const all = [...ventaFuerte, ...ventaDebil]
  if (new RegExp(`^(${all.join('|')})\\b`).test(texto)) {
    return texto.replace(new RegExp(`^(${all.join('|')})\\b`), '').trim()
  }
  const tokens = texto.split(' ').filter(Boolean)
  const idx = tokens.findIndex(t => all.includes(t))
  if (idx >= 0) {
    return tokens.slice(idx + 1).join(' ').trim()
  }
  return texto.trim()
}

function extraerBase(transcript, conservarSuelto, lexico = LEXICO_BASE) {
  const c = compilar(lexico)
  const slots = {
    productoHint: '',
    cantidad: 1,
    precioUnitario: null,
    ubicacion: null,
    tipoVenta: 'directa',
    clienteHint: null
  }
  let suelto = false

  let texto = normalizar(transcript)

  // Ubicación se extrae sobre TODO el texto (incluso si el verbo va al final),
  // para no perderla al recortar el verbo.
  const loc = texto.match(/\b(?:desde|del|de|en|al)\s+(?:el\s+|la\s+)?(kiosco|quiosco|almacen)\b/)
  if (loc) {
    slots.ubicacion = loc[1] === 'almacen' ? 'almacen' : 'quiosco'
    texto = texto.replace(loc[0], ' ')
  }

  let work = recortarVerbo(texto, c.ventaFuerte, c.ventaDebil)

  // Tipo de venta. Con preposición ("de regalo", "para la casa") es inequívoco
  // y siempre se quita. Suelto ("pan regalo", "refresco familiar") es ambiguo:
  // ver `conservarSuelto`. `normal` es el valor por defecto y se descarta.
  const conPrep = work.match(/\b(?:de|para|como|en)\s+(regalo|familiar)\b/)
  if (conPrep) {
    slots.tipoVenta = conPrep[1]
    work = work.replace(conPrep[0], ' ')
  } else if (/\bregalo\b/.test(work)) {
    suelto = true
    if (!conservarSuelto) {
      slots.tipoVenta = 'regalo'
      work = work.replace(/\bregalo\b/g, ' ')
    }
  } else if (/\bfamiliar\b/.test(work)) {
    suelto = true
    if (!conservarSuelto) {
      slots.tipoVenta = 'familiar'
      work = work.replace(/\bfamiliar\b/g, ' ')
    }
  } else if (/\b(?:de|para)\s+(?:la\s+)?casa\b/.test(work)) {
    slots.tipoVenta = 'casa'
    work = work.replace(/\b(?:de|para)\s+(?:la\s+)?casa\b/g, ' ')
  } else if (/\bcasa\b/.test(work)) {
    suelto = true
    if (!conservarSuelto) {
      slots.tipoVenta = 'casa'
      work = work.replace(/\bcasa\b/g, ' ')
    }
  }
  if (/\bnormal\b/.test(work)) {
    suelto = true
    if (!conservarSuelto) work = work.replace(/\bnormal\b/g, ' ')
  }

  // Precio: "a precio de treinta y cinco", "a 10 pesos", "a diez".
  const tokensPrecio = work.split(' ').filter(Boolean)
  const precio = parsearPrecio(tokensPrecio)
  if (precio) {
    slots.precioUnitario = precio.valor
    tokensPrecio.splice(precio.desde, precio.hasta - precio.desde)
  }
  work = tokensPrecio.join(' ')

  // Cliente: "a don Juan Pérez" / "para Juan Pérez". Se aceptan hasta cuatro
  // palabras al final y se descartan honoríficos y palabras que no son nombre
  // ("para llevar"). Si no queda ningún nombre válido, se elimina la frase
  // igualmente para que no contamine el producto.
  const cliente = work.match(/\b(?:a|para)\s+(?:(?:don|dona|senor|senora)\s+)?([a-z]+(?:\s+[a-z]+){0,3})\s*$/)
  if (cliente) {
    const nombre = cliente[1]
      .split(/\s+/)
      .filter(t => t && !PALABRAS_VACIAS.has(t) && !PALABRAS_NO_CLIENTE.has(t))
    if (nombre.length) slots.clienteHint = nombre.join(' ')
    work = work.replace(cliente[0], ' ')
  }

  // Cantidad: número al inicio ("cinco", "treinta y cinco", "dos mil"), con
  // docenas ("una docena", "media docena", "dos docenas"). Una docena son 12
  // unidades.
  const tokens = work.split(' ').filter(Boolean)
  if (tokens.length) {
    const numero = parseNumberSequence(tokens)
    let usados = 0
    let cantidad = 1

    if (numero) {
      if (numero.valor > 0) cantidad = Math.max(1, Math.trunc(numero.valor))
      usados = numero.consumidos
    }

    if (DOCENAS.has(tokens[usados])) {
      cantidad = (numero && numero.valor > 0 ? Math.trunc(numero.valor) : 1) * 12
      usados++
    } else if (!numero && tokens[0] === 'media' && DOCENAS.has(tokens[1])) {
      cantidad = 6
      usados = 2
    }

    slots.cantidad = cantidad
    tokens.splice(0, usados)
  }

  slots.productoHint = limpiarBordes(tokens)
    .join(' ')
    .replace(ARTICULOS_INICIALES, '')
    .trim()

  return { slots, suelto }
}

/**
 * Fase B — extracción de slots, específica del comando. Hoy solo existe
 * `venta_directa`; el segundo comando debe traer su propio extractor, no
 * reutilizar este.
 *
 * Si la frase trae una palabra de tipo de venta ambigua ("refresco familiar"),
 * se añade `alternativaTipo`: el producto y el tipo de venta que resultan de
 * NO interpretarla como tipo. La capa de catálogo decide cuál usar con
 * `preferirHintConTipo`.
 */
export function extraerSlots(comando, transcript, lexico = LEXICO_BASE) {
  const c = compilar(lexico)
  if (comando === 'consulta_stock') {
    const s = extraerConsultaPura(normalizar(transcript))
    return { productoHint: s.productoHint, ubicacion: s.ubicacion }
  }
  if (comando === 'navegacion') {
    const dest = resolverNavegacionDestino(transcript, c, lexico)
    return { destino: dest }
  }
  if (comando !== 'venta_directa') return {}

  const principal = extraerBase(transcript, false, lexico)
  if (principal.suelto) {
    const alterna = extraerBase(transcript, true, lexico)
    if (alterna.slots.productoHint && alterna.slots.productoHint !== principal.slots.productoHint) {
      principal.slots.alternativaTipo = {
        productoHint: alterna.slots.productoHint,
        tipoVenta: alterna.slots.tipoVenta
      }
    }
  }
  return principal.slots
}

/**
 * ¿La lectura con la palabra de tipo incluida es un producto del catálogo?
 * Solo si coincide exacto ("Refresco familiar" existe como producto). Un match
 * parcial no basta: "vende un pan regalo" no debe volverse "pan regalo".
 */
export function preferirHintConTipo(candidatosAlternativa) {
  return Number(candidatosAlternativa?.[0]?.score) >= 0.99
}

function resolverNavegacionDestino(transcript, c) {
  const RELLENOS_NAV = new Set(['a', 'al', 'la', 'el', 'los', 'las', 'de', 'del', 'mi', 'mis', 'por', 'favor', 'pantalla', 'vista', 'seccion', 'modulo', 'en', 'ya', 'ahora', 'me'])
  const inverted = {}
  if (c.destinos) {
    for (const [key, palabras] of Object.entries(c.destinos)) {
      for (const w of palabras) inverted[w] = key
    }
  }
  const tokens = normalizar(transcript).split(' ').filter(Boolean)
  const verboIdx = tokens.findIndex(t => Array.isArray(c.navegacionVerbo) && c.navegacionVerbo.includes(t))
  if (verboIdx < 0) return null
  let i = verboIdx + 1
  while (i < tokens.length && RELLENOS_NAV.has(tokens[i])) i++
  if (i >= tokens.length) return null
  const destino = inverted[tokens[i]]
  if (!destino) return null
  return destino
}

/**
 * Elige la mejor hipótesis STT (N-best) tras haberla evaluado.
 * Ver reglas en el plan v2 P5.
 */
export function elegirAlternativa(evaluadas, { margen = 0.1 } = {}) {
  const lista = Array.isArray(evaluadas) ? evaluadas : []
  if (!lista.length) return 0
  const base = lista[0]
  const baseIndice = (base && Number.isFinite(base.indice)) ? base.indice : 0
  const baseComando = base?.comando

  if (baseComando === 'navegacion') return baseIndice
  if ((baseComando === 'venta_directa' || baseComando === 'consulta_stock') && base?.elegido) {
    return baseIndice
  }

  const validas = lista.slice(1).filter(x => x && x.comando !== 'desconocido'
    && (x.comando === 'navegacion' || x.elegido === true))

  if (baseComando === 'desconocido') {
    if (validas.length) return (Number.isFinite(validas[0].indice)) ? validas[0].indice : lista.indexOf(validas[0])
    return baseIndice
  }

  const mismoComando = validas.filter(x => x.comando === baseComando)
  const filtradas = mismoComando.filter((x) => {
    if (base?.encontrados === 0) return true
    return Number(x.efectivo) >= Number(base?.efectivo || 0) + margen
  })
  if (filtradas.length) {
    const elegido = filtradas[0]
    return Number.isFinite(elegido.indice) ? elegido.indice : lista.indexOf(elegido)
  }
  return baseIndice
}

/** Interpretación completa (clasificación + slots) en un solo objeto. */
export function interpretar(transcript, lexico = LEXICO_BASE) {
  const clasificado = resolverComando(transcript, lexico)
  return {
    comando: clasificado.comando,
    transcript: String(transcript ?? ''),
    confidence: clasificado.confianza,
    slots: extraerSlots(clasificado.comando, transcript, lexico),
    reasons: clasificado.reasons
  }
}

/**
 * Una venta no puede cambiar de ubicación en silencio: si el comando dice una
 * ubicación distinta a la de la vista actual, se marca `conflicto` y la UI
 * debe pedir confirmación (o rechazar) en vez de vender en el sitio equivocado.
 */
export function resolverUbicacion(slots, ubicacionVista) {
  const dicha = slots?.ubicacion ?? null
  if (!dicha) return { ubicacion: ubicacionVista, conflicto: false }
  return { ubicacion: dicha, conflicto: dicha !== ubicacionVista }
}

/**
 * Combina confianza del STT con el score del fuzzy SIN inflarlo: solo puede
 * penalizar. Un STT muy seguro no puede "rescatar" un match de producto malo
 * (eso era una venta equivocada esperando a pasar el umbral).
 *
 * Además cubre el caso real del plugin: `CONFIDENCE_SCORES` vacío → 0f. Con 0
 * se usa solo el fuzzy, nunca 0.
 */
export function combinarConfianza(fuzzyScore, sttConfidence) {
  const fuzzy = Math.min(1, Math.max(0, Number(fuzzyScore) || 0))
  const stt = Math.min(1, Math.max(0, Number(sttConfidence) || 0))
  if (!(stt > 0)) return fuzzy
  return fuzzy * (0.7 + 0.3 * stt)
}

/**
 * Decide si un candidato se puede precargar sin preguntar.
 *
 * Además del umbral exige margen sobre el segundo: dos productos que puntúan
 * igual (o casi) no se resuelven por orden alfabético, se preguntan. Devuelve
 * `efectivo` para poder mostrarlo en el diálogo de candidatos.
 */
export function decidirProducto(candidatos, opciones = {}) {
  const lista = Array.isArray(candidatos) ? candidatos : []
  const umbral = Number(opciones.umbral) || UMBRAL_PRODUCTO
  const sttConfidence = Number(opciones.sttConfidence) || 0
  if (!lista.length) return { elegido: null, ambiguo: false, efectivo: 0 }

  const mejor = lista[0]
  const efectivo = combinarConfianza(mejor?.score, sttConfidence)
  const efectivoSegundo = lista[1] ? combinarConfianza(lista[1].score, sttConfidence) : 0
  const exacto = Number(mejor?.score) >= 0.99
  const conMargen = efectivoSegundo === 0 || efectivo - efectivoSegundo >= 0.1

  if (efectivo >= umbral && (exacto || conMargen)) {
    return { elegido: mejor, ambiguo: false, efectivo }
  }
  return { elegido: null, ambiguo: true, efectivo }
}
