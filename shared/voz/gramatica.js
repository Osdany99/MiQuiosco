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
  veintiuno: 21,
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
  'anota',
  'anotame',
  'anotamelo',
  'registra',
  'registrame',
  'saca',
  'sacame'
]

const PREFIJO_VENTA = new RegExp(`^(${VERBOS_VENTA.join('|')})\\b`)
const VERBO_VENTA = new RegExp(`\\b(${VERBOS_VENTA.join('|')})\\b`)

// Marcadores de comandos que todavía NO existen. Se clasifican como
// `desconocido` a propósito: es preferible decir "todavía no sé hacer eso" a
// interpretarlos como una venta y precargar algo equivocado.
const MARCAS_CONSULTA = /\b(cuanto|cuanta|cuantos|cuantas|stock|existencias|inventario)\b/
const MARCAS_NAVEGACION = /\b(abre|abrir|abreme|ir a|ve a|vamos a|muestra|muestrame)\b/

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

/**
 * Número compuesto a partir de una secuencia de tokens: "treinta y cinco" → 35,
 * "ciento veinte" → 120, "doscientos cincuenta y cinco" → 255.
 *
 * Devuelve `{ valor, consumidos }` para que el extractor sepa cuántos tokens
 * retirar; `null` si la secuencia no empieza por un número.
 */
export function parseNumberSequence(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return null

  const primero = normalizar(tokens[0])
  if (/^\d+(?:\.\d+)?$/.test(primero)) return { valor: Number(primero), consumidos: 1 }

  const tokenEn = i => normalizar(tokens[i])

  const centena = CENTENAS[primero]
  if (centena != null) {
    let valor = centena
    let i = 1
    const decena = DECENAS[tokenEn(i)]
    const unidadSuelta = UNIDADES[tokenEn(i)]

    if (decena != null && decena >= 30) {
      valor += decena
      i++
      if (tokenEn(i) === 'y') {
        const unidad = UNIDADES[tokenEn(i + 1)]
        if (unidad != null && unidad > 0) {
          valor += unidad
          i += 2
        }
      }
    } else if (decena != null || unidadSuelta != null) {
      valor += decena ?? unidadSuelta
      i++
    }

    return { valor, consumidos: i }
  }

  const decena = DECENAS[primero]
  if (decena != null && decena >= 30) {
    let valor = decena
    let i = 1
    if (tokenEn(i) === 'y') {
      const unidad = UNIDADES[tokenEn(i + 1)]
      if (unidad != null && unidad > 0) {
        valor += unidad
        i += 2
      }
    }
    return { valor, consumidos: i }
  }

  if (decena != null || UNIDADES[primero] != null) {
    return { valor: decena ?? UNIDADES[primero], consumidos: 1 }
  }

  return null
}

/**
 * Fase A — clasificación.
 *
 * Regla: manda el verbo de acción. Si no hay verbo, solo se acepta una venta
 * cuando hay una cantidad explícita y algo más (contexto de inventario), que es
 * el caso "cinco panes" pulsa-y-habla desde /quiosco.
 */
export function resolverComando(transcript) {
  const texto = normalizar(transcript)
  if (!texto) return { comando: 'desconocido', confianza: 0, reasons: ['sin_texto'] }

  if (PREFIJO_VENTA.test(texto)) {
    return { comando: 'venta_directa', confianza: 0.95, reasons: ['verbo_venta'] }
  }

  if (MARCAS_CONSULTA.test(texto)) {
    return { comando: 'desconocido', confianza: 0, reasons: ['consulta_no_soportada'] }
  }

  if (MARCAS_NAVEGACION.test(texto)) {
    return { comando: 'desconocido', confianza: 0, reasons: ['navegacion_no_soportada'] }
  }

  if (VERBO_VENTA.test(texto)) {
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
 * Fase B — extracción de slots, específica del comando. Hoy solo existe
 * `venta_directa`; el segundo comando debe traer su propio extractor, no
 * reutilizar este.
 */
export function extraerSlots(comando, transcript) {
  const slots = {
    productoHint: '',
    cantidad: 1,
    precioUnitario: null,
    ubicacion: null,
    tipoVenta: 'directa',
    clienteHint: null
  }
  if (comando !== 'venta_directa') return slots

  let work = normalizar(transcript).replace(PREFIJO_VENTA, '').trim()

  // Ubicación: "en el quiosco", "desde el almacén", "del kiosco" o sin
  // artículo ("en almacén"). El artículo opcional evita que "el" se quede
  // pegado al nombre del producto.
  const loc = work.match(/\b(?:desde|del|de|en|al)\s+(?:el\s+|la\s+)?(kiosco|quiosco|almacen)\b/)
  if (loc) {
    slots.ubicacion = loc[1] === 'almacen' ? 'almacen' : 'quiosco'
    work = work.replace(loc[0], ' ')
  }

  // Tipo de venta. `normal` se descarta: es el valor por defecto. "de la casa"
  // y "para la casa" se eliminan completos para no dejar "de la" en el producto.
  if (/\bregalo\b/.test(work)) {
    slots.tipoVenta = 'regalo'
    work = work.replace(/\bregalo\b/g, ' ')
  } else if (/\bfamiliar\b/.test(work)) {
    slots.tipoVenta = 'familiar'
    work = work.replace(/\bfamiliar\b/g, ' ')
  } else if (/\b(?:de|para)\s+la\s+casa\b/.test(work)) {
    slots.tipoVenta = 'casa'
    work = work.replace(/\b(?:de|para)\s+la\s+casa\b/g, ' ')
  } else if (/\b(?:de|para)\s+casa\b/.test(work)) {
    slots.tipoVenta = 'casa'
    work = work.replace(/\b(?:de|para)\s+casa\b/g, ' ')
  } else if (/\bcasa\b/.test(work)) {
    slots.tipoVenta = 'casa'
    work = work.replace(/\bcasa\b/g, ' ')
  }
  work = work.replace(/\bnormal\b/g, ' ')

  // Precio explícito: "a precio de diez". Si el token no es un número se
  // deja intacto para que siga formando parte del producto.
  const price = work.match(/\ba\s+precio\s+de\s+(\d+(?:[.,]\d+)?|[a-z]+)\b/)
  if (price) {
    const valor = parseNumberToken(price[1])
    if (valor != null) {
      slots.precioUnitario = valor
      work = work.replace(price[0], ' ')
    }
  }

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

  const tokens = work.split(' ').filter(Boolean)
  if (tokens.length) {
    const numero = parseNumberSequence(tokens)
    if (numero) {
      if (numero.valor > 0) slots.cantidad = Math.max(1, Math.trunc(numero.valor))
      tokens.splice(0, numero.consumidos)
    }
  }

  slots.productoHint = limpiarBordes(tokens)
    .join(' ')
    .replace(ARTICULOS_INICIALES, '')
    .trim()

  return slots
}

/** Interpretación completa (clasificación + slots) en un solo objeto. */
export function interpretar(transcript) {
  const clasificado = resolverComando(transcript)
  return {
    comando: clasificado.comando,
    transcript: String(transcript ?? ''),
    confidence: clasificado.confianza,
    slots: extraerSlots(clasificado.comando, transcript),
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
