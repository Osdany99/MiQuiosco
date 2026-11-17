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
import { esConsultaDia, esConsultaGanancia } from './dia.js'
import { esConsultaCaja } from './caja.js'
import { resolverFechaDictada } from './fechas.js'

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
  'granel',
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

const RE_UBICACION = /\b(?:desde|del|de|en|al)\s+(?:el\s+|la\s+)?(kiosco|quiosco|almacen)\b/

/**
 * Extrae la ubicación dicha ("del almacén", "en el quiosco") y la quita del
 * texto. Devuelve `{ ubicacion, texto }` para que `extraerBase` y
 * `extraerConsultaPura` no repitan la regex.
 */
function extraerUbicacion(texto) {
  const loc = texto.match(RE_UBICACION)
  if (!loc) return { ubicacion: null, texto }
  return {
    ubicacion: loc[1] === 'almacen' ? 'almacen' : 'quiosco',
    texto: texto.replace(loc[0], ' ')
  }
}

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
  const consultaMarca = Array.isArray(clave?.consultaMarca) ? clave.consultaMarca : null

  const out = {
    ventaFuerte,
    ventaDebil,
    consultaMarca,
    PREFIJO_VENTA: new RegExp(`^(${ventaFuerte.join('|')})\\b`),
    PREFIJO_VENTA_DEBIL: new RegExp(`^(${ventaDebil.join('|')})\\b`),
    PREFIJO_VENTA_CUALQUIERA: new RegExp(`^(${[...ventaFuerte, ...ventaDebil].join('|')})\\b`),
    VERBO_VENTA: new RegExp(`\\b(${ventaFuerte.join('|')})\\b`)
  }
  CACHE_COMPILADO.set(clave, out)
  return out
}

function extraerConsultaPura(texto) {
  const RELLENOS_CONSULTA = new Set(['unidades', 'unidad', 'dime', 'dame', 'decir', 'dices', 'cual', 'cuales', 'es', 'son', 'esta', 'estan', 'me', 'nos', 'cuesta', 'cuestan', 'precio', 'precios', 'vale', 'valen', 'sale', 'salen', 'como', 'a'])
  let work = texto

  // Ubicación: mismo helper que `extraerBase` (antes estaba duplicado).
  const { ubicacion, texto: sinUbicacion } = extraerUbicacion(work)
  work = sinUbicacion

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
 * ¿La frase pregunta por deudas? «cuánto debe Juan», «las deudas», «quién me
 * debe más».
 *
 * `debo` queda fuera a propósito: «cuánto debo» puede ser una compra del
 * negocio a un proveedor y una cifra inventada sería peor que el silencio.
 */
export function esConsultaDeuda(texto) {
  const t = normalizar(texto)
  if (!t || /\bdebo\b/.test(t)) return false
  return /\b(debe|deben|deuda|deudas)\b/.test(t)
}

// Palabras que rodean al nombre del cliente. Solo se recortan por delante y,
// al final, las de cortesía: "señora de juan" conserva su "de".
const RELLENO_DEUDA_INICIAL = new Set([
  'cuanto', 'cuanta', 'cuantos', 'cuantas', 'debe', 'deben', 'deuda', 'deudas',
  'fiado', 'fiados', 'me', 'le', 'les', 'se', 'tiene', 'tienen',
  'queda', 'quedan', 'saldo', 'pendiente', 'pendientes', 'cual', 'cuales',
  'que', 'quien', 'quienes', 'es', 'son', 'el', 'la', 'los', 'las',
  'de', 'del', 'al', 'a', 'total', 'hay', 'y', 'mas'
])
const RELLENO_DEUDA_FINAL = new Set(['por', 'favor', 'gracias', 'hoy', 'ahora', 'ahorita', 'total', 'y', 'mas'])

// Verbos con los que se fía («fía dos panes a Juan»). «fiado» suelto también
// vale: «anota fiado dos panes a Juan».
const VERBOS_FIADO = new Set(['fia', 'fiale', 'fiar', 'fias', 'fian', 'fiame', 'fiamelo', 'fiarle'])
const VERBOS_VENTA_FIADO = ['vende', 'vendeme', 'anota', 'anotame', 'apunta', 'apuntame', 'registra', 'saca', 'despacha']

/**
 * ¿La frase manda fiar? Exige verbo de fiado al inicio o «fiado» con un verbo
 * de venta: «cuánto tengo fiado» es una consulta, no una deuda nueva.
 */
export function esVentaFiada(texto) {
  const t = normalizar(texto)
  if (!t) return false
  const tokens = t.split(' ')
  if (VERBOS_FIADO.has(tokens[0])) return true
  return VERBOS_VENTA_FIADO.includes(tokens[0]) && tokens.includes('fiado')
}

/**
 * Slots de `venta_fiada`: producto, cantidad, ubicación y a quién.
 *
 * El cliente va tras la última «a»/«para» de la frase («fía 2 panes a Juan»).
 * El resto se lee con el extractor de venta (cantidad, artículos, ubicación),
 * para no tener dos gramáticas de producto.
 */
export function extraerFiadoSlots(transcript, lexico = LEXICO_BASE) {
  const tokens = normalizar(transcript).split(' ').filter(Boolean)
  if (!tokens.length) return { productoHint: '', cantidad: 1, ubicacion: null, clienteHint: '' }

  let inicio = 0
  if (VERBOS_FIADO.has(tokens[0])) {
    inicio = 1
  } else {
    while (inicio < tokens.length && tokens[inicio] !== 'fiado') inicio++
    inicio++
  }

  // Corte por el cliente: la última preposición con algo detrás.
  let corte = -1
  for (let i = tokens.length - 1; i > inicio; i--) {
    if (tokens[i - 1] === 'a' || tokens[i - 1] === 'para') {
      corte = i - 1
      break
    }
  }

  const clienteHint = corte >= 0 ? tokens.slice(corte + 1).join(' ').trim() : ''
  const producto = tokens.slice(inicio, corte >= 0 ? corte : tokens.length)
  const base = producto.length
    ? extraerBase(`vende ${producto.join(' ')}`, false, lexico).slots
    : { productoHint: '', cantidad: 1, ubicacion: null }

  return {
    productoHint: base.productoHint || '',
    cantidad: Number(base.cantidad) || 1,
    ubicacion: base.ubicacion ?? null,
    clienteHint
  }
}

/** Nombre del cliente dicho en la frase ('' = no se dijo). */
export function extraerClienteFiado(transcript) {
  return extraerFiadoSlots(transcript).clienteHint
}

const VERBOS_COBRO = new Set([
  'cobra', 'cobrame', 'cobrale', 'cobrar', 'cobre', 'cobren',
  'abona', 'aboname', 'abonale', 'abonar', 'abono',
  'paga', 'pagame', 'pagale', 'pagar', 'pago', 'pague', 'pagaron'
])

const VERBOS_COBRO_EN_MEDIO = new Set(['pago', 'pague', 'pagaron', 'abono', 'abono'])

/**
 * ¿La frase manda cobrar una deuda? «cobra 200 a Yunior», «cobra la deuda de
 * María», «Yunior me pagó 100», «abona 50 a Juan».
 *
 * Tiene que ir antes que la venta: «cobra» es verbo de venta («cobra 2 panes»).
 * La diferencia es que un cobro trae importe o deuda, no un producto.
 */
export function esCobroDeuda(texto) {
  const t = normalizar(texto)
  if (!t) return false
  const tokens = t.split(' ')
  // «cuánto pagó Juan» es una consulta, no un cobro.
  if (/^(cuanto|cuanta|cuantos|cuantas)\b/.test(t)) return false

  const verbo = tokens[0]
  if (!VERBOS_COBRO.has(verbo)) {
    // «juan me pago 200»: el cliente va delante del verbo.
    const idx = tokens.findIndex(tok => VERBOS_COBRO_EN_MEDIO.has(tok))
    if (idx <= 0) return false
    return tokens.slice(0, idx).some(tok => tok !== 'me' && tok !== 'nos')
  }

  if (/\b(deuda|deudas|fiado)\b/.test(t)) return true

  const idxCliente = tokens.findIndex((tok, i) => i > 0 && (tok === 'a' || tok === 'para'))
  if (idxCliente < 0) return false

  const antes = tokens.slice(1, idxCliente)
  const conMoneda = antes.includes('pesos') || antes.includes('peso')
  const conProducto = antes.some(tok => !PALABRAS_VACIAS.has(tok)
    && parseNumberToken(tok) == null
    && tok !== 'pesos' && tok !== 'peso'
    && tok !== 'todo' && tok !== 'toda')
  const conImporte = antes.some(tok => parseNumberToken(tok) != null
    || tok === 'todo' || tok === 'toda')

  // «cobra 2 panes a Juan» sigue siendo una venta: hay producto.
  return (conImporte && !conProducto) || conMoneda || antes.length === 0
}

const RELLENO_CLIENTE_COBRO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'deuda', 'deudas', 'fiado', 'me', 'nos'
])

/**
 * Slots de `cobro_deuda`: a quién, cuánto y cómo paga.
 *
 * `monto` es `'todo'` o el importe dicho. Nunca lleva producto: cobrar no
 * mueve inventario.
 */
export function extraerCobroSlots(transcript) {
  const tokens = normalizar(transcript).split(' ').filter(Boolean)
  const texto = tokens.join(' ')
  const formaPago = /\btransferencia\b/.test(texto) ? 'transferencia' : 'efectivo'
  if (!tokens.length) return { clienteHint: '', monto: 'todo', formaPago }

  const idxVerbo = tokens.findIndex(t => VERBOS_COBRO.has(t))
  let clienteTokens = []
  let zonaMonto = []

  if (idxVerbo > 0) {
    // «juan me pago 200»
    clienteTokens = tokens.slice(0, idxVerbo)
    zonaMonto = tokens.slice(idxVerbo + 1)
  } else {
    const resto = tokens.slice(1)
    const idxCliente = resto.findIndex(t => t === 'a' || t === 'para' || t === 'de')
    if (idxCliente >= 0) {
      clienteTokens = resto.slice(idxCliente + 1)
      zonaMonto = resto.slice(0, idxCliente)
    } else {
      zonaMonto = resto
    }
  }

  clienteTokens = clienteTokens.filter(t => !RELLENO_CLIENTE_COBRO.has(t) || t === 'de')
  // «… a Yunior por transferencia»: el método de pago no es parte del nombre.
  const cortePago = clienteTokens.findIndex(t => t === 'por' || t === 'con' || t === 'transferencia' || t === 'efectivo')
  if (cortePago >= 0) clienteTokens = clienteTokens.slice(0, cortePago)

  const numeros = zonaMonto.filter(t => t !== 'pesos' && t !== 'peso')
  const numero = parseNumberSequence(numeros)
  const monto = numeros.includes('todo') || numeros.includes('toda') || !numero
    ? 'todo'
    : Number(numero.valor)

  return { clienteHint: clienteTokens.join(' ').trim(), monto, formaPago }
}

/** Nombre del cliente dicho en la frase ('' = no se dijo: se pide el total). */
export function extraerClienteHint(transcript) {
  const tokens = normalizar(transcript).split(' ').filter(Boolean)
  let desde = 0
  while (desde < tokens.length && RELLENO_DEUDA_INICIAL.has(tokens[desde])) desde++
  let hasta = tokens.length
  while (hasta > desde && RELLENO_DEUDA_FINAL.has(tokens[hasta - 1])) hasta--
  return tokens.slice(desde, hasta).join(' ').trim()
}

/**
 * Slots de `consulta_deuda`: a quién se pregunta y qué se quiere saber.
 * `ambito` decide la respuesta: cliente concreto, total o el que más debe.
 */
export function extraerDeudaSlots(transcript) {
  const texto = normalizar(transcript)
  const clienteHint = extraerClienteHint(texto)
  let ambito = 'total'
  if (/\bquien(es)?\b/.test(texto) || /\bmas\b/.test(texto)) ambito = 'mayor'
  if (clienteHint) ambito = 'cliente'
  return { clienteHint, ambito }
}

/**
 * Fase A — clasificación.
 */
export function resolverComando(transcript, lexico = LEXICO_BASE) {
  const c = compilar(lexico)
  const texto = normalizar(transcript)
  if (!texto) return { comando: 'desconocido', confianza: 0, reasons: ['sin_texto'] }

  // Repetir la última respuesta y ayuda: frases cortas y sin producto. Van
  // antes que la venta para que "otra vez" no se lea como un producto.
  if (/^(repite|repitelo|repetir|otra vez|que dijiste|como dijiste)\b/.test(texto)) {
    return { comando: 'repetir', confianza: 0.9, reasons: ['repetir'] }
  }
  if (/^(ayuda|que puedes hacer|que sabes hacer|comandos|que comandos|como te uso)\b/.test(texto)) {
    return { comando: 'ayuda', confianza: 0.9, reasons: ['ayuda'] }
  }

  // Fases K, L, M y N: comandos ASISTIDOS. No escriben nada; como mucho
  // prellenan un formulario o navegan. Van antes de venta/precio/caja porque
  // comparten verbos («entraron», «cambia el precio», «cierra el cuadre»,
  // «pasa … al quiosco») y antes de la venta débil, que se tragaría «pasa 5
  // panes al quiosco» como una venta.
  if (esEntradaInventario(texto)) {
    return { comando: 'entrada_inventario', confianza: 0.9, reasons: ['verbo_entrada'] }
  }
  if (esCambioPrecio(texto)) {
    return { comando: 'cambio_precio', confianza: 0.9, reasons: ['verbo_precio'] }
  }
  if (esCuadreAccion(texto)) {
    return { comando: 'cuadre_accion', confianza: 0.9, reasons: ['verbo_cuadre'] }
  }
  if (esTraspaso(texto)) {
    return { comando: 'traspaso', confianza: 0.9, reasons: ['verbo_traspaso'] }
  }

  // Fiar: «fía dos panes a Juan». Va antes de la venta porque «anota fiado …»
  // trae verbo de venta y no debe registrarse como venta directa.
  if (esVentaFiada(texto)) {
    return { comando: 'venta_fiada', confianza: 0.9, reasons: ['verbo_fiado'] }
  }

  // Cobrar deuda: va antes de la venta porque «cobra» también es verbo de venta
  // («cobra 2 panes»). Sin deuda ni importe, sigue siendo venta.
  if (esCobroDeuda(texto)) {
    return { comando: 'cobro_deuda', confianza: 0.9, reasons: ['verbo_cobro'] }
  }

  if (c.PREFIJO_VENTA.test(texto)) {
    return { comando: 'venta_directa', confianza: 0.95, reasons: ['verbo_venta'] }
  }

  // Deudas: "cuánto debe Juan", "las deudas de María", "quién me debe más".
  // Va antes de precio/stock porque la frase también trae "cuánto" y, sin esta
  // rama, caía en la guarda de "consulta no soportada".
  if (esConsultaDeuda(texto)) {
    return { comando: 'consulta_deuda', confianza: 0.9, reasons: ['consulta_deuda'] }
  }

  // Ganancia y caja: datos del cuadre, no del catálogo. Van antes del resumen
  // del día porque «cuánto gané hoy» también trae marca de día y no debe
  // responderse con el importe vendido a secas.
  if (esConsultaGanancia(texto)) {
    return { comando: 'consulta_ganancia', confianza: 0.9, reasons: ['consulta_ganancia'] }
  }
  if (esConsultaCaja(texto)) {
    return { comando: 'consulta_caja', confianza: 0.9, reasons: ['consulta_caja'] }
  }

  // Resumen del día: "cómo va el día", "cuánto vendí hoy". Antes se descartaba
  // a propósito; ahora se contesta con las ventas del día del puesto.
  if (esConsultaDia(texto)) {
    return { comando: 'consulta_dia', confianza: 0.9, reasons: ['consulta_dia'] }
  }

  // Precio: "cuánto cuesta", "a cómo está", "cuánto vale". Antes caía en
  // `consulta_no_soportada` y el jefe se quedaba sin respuesta.
  if (/\b(?:cuesta|cuestan|precio|precios|vale|valen|sale|salen)\b|\ba como\b/.test(texto)) {
    const slots = extraerConsultaPura(texto)
    if (slots.productoHint) {
      return { comando: 'consulta_precio', confianza: 0.9, reasons: ['consulta_precio'] }
    }
    return { comando: 'desconocido', confianza: 0, reasons: ['consulta_sin_producto'] }
  }

  // Consulta: marcas presentes.
  if (/\bcuanto\b|\bcuanta\b|\bcuantos\b|\bcuantas\b|\bstock\b|\bexistencia(s)?\b|\binventario\b|\btenemos\b|\btengo\b|\bdisponible(s)?\b|\bhay\b|\bqueda(n)?\b/.test(texto)) {
    // Caja, ganancia y cobros todavía no se responden como consulta: mejor
    // silencio que una cifra inventada. («cuánto pagó Juan» no es stock.)
    if (/\bganancia(s)?\b|\bgane\b|\btotal\b|\bcaja\b|\bpago\b|\bpague\b|\bpagaron\b|\babono\b/.test(texto)) {
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

/**
 * Nombre de cliente al final: "a Juan", "para don Juan Pérez". Hasta cuatro
 * palabras para no tragarse media frase.
 */
const RE_CLIENTE = /\b(?:a|para)\s+(?:(?:don|dona|senor|senora)\s+)?([a-z]+(?:\s+[a-z]+){0,3})\s*$/

/**
 * Quita el cliente del final del texto. Devuelve el texto restante y el nombre,
 * o `nombre: null` si lo que hay detrás no parece una persona ("para llevar",
 * "a diez cada uno": un número nunca es un cliente).
 */
function quitarCliente(texto) {
  const cliente = texto.match(RE_CLIENTE)
  if (!cliente) return { texto, nombre: null }
  const palabras = cliente[1].split(/\s+/).filter(Boolean)
  // "a diez", "a diez cada uno": es un precio, no un nombre.
  if (palabras.length && parseNumberToken(palabras[0]) != null) {
    return { texto, nombre: null }
  }
  const nombre = palabras
    .filter(t => t && !PALABRAS_VACIAS.has(t) && !PALABRAS_NO_CLIENTE.has(t))
  return {
    texto: texto.replace(cliente[0], ' '),
    nombre: nombre.length ? nombre.join(' ') : null
  }
}

/** Quita el precio ("a 10 pesos", "a precio de diez") y devuelve su valor. */
function quitarPrecio(texto) {
  const tokens = texto.split(' ').filter(Boolean)
  const precio = parsearPrecio(tokens)
  if (!precio) return { texto, valor: null }
  tokens.splice(precio.desde, precio.hasta - precio.desde)
  return { texto: tokens.join(' '), valor: precio.valor }
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
  const ubicacion = extraerUbicacion(texto)
  if (ubicacion.ubicacion) slots.ubicacion = ubicacion.ubicacion
  texto = ubicacion.texto

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

  // Cliente y precio, en cualquier orden: "… a 200 pesos a Juan" y
  // "… a Juan a 200". Se intenta el cliente primero (lo más habitual es que
  // cierre la frase); si no hay, se quita el precio y se reintenta, porque
  // "a Juan a 15" solo deja el nombre al descubierto después de quitar el 15.
  let extraido = quitarCliente(work)
  if (extraido.nombre) slots.clienteHint = extraido.nombre
  work = extraido.texto

  extraido = quitarPrecio(work)
  if (extraido.valor != null) slots.precioUnitario = extraido.valor
  work = extraido.texto

  if (!slots.clienteHint) {
    extraido = quitarCliente(work)
    if (extraido.nombre) slots.clienteHint = extraido.nombre
    work = extraido.texto
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
/**
 * Verbos de los comandos ASISTIDOS (fases K, L, N). Se reconocen aquí, no en
 * `lexico.js`: no son parte del vocabulario de venta y no deben contaminarlo.
 */
const VERBOS_ENTRADA = /^(?:entraron|entro|entra|entrada|ingresaron|ingreso|ingresa|llegaron|llego|llega|compre|compramos|compra|recibi|recibimos|meti|metimos|mete|echaron|echo)\b/
const VERBOS_PRECIO = /^(?:cambia|cambiar|cambiale|cambiamelo|pon|ponle|ponme|pongale|sube|subele|baja|bajale|actualiza|actualizale|corrige|corrigele|deja|dejalo|fija|fijale)\b/
const VERBOS_TRASPASO = /^(?:pasa|pasame|pasale|pasar|mueve|mueveme|muevelo|muevela|traspasa|traspasame|traslada|transfiere|transferir|transfiereme|transferi|transfiero|repone|repon|reponer)\b/

/** ¿La frase trae algún número (dígitos o en palabras)? */
function hayNumero(texto) {
  return /\d/.test(texto) || texto.split(' ').some(t => parseNumberToken(t) != null)
}

/** «Entraron 20 panes a 10 pesos»: entrada de lote al almacén (Fase K). */
export function esEntradaInventario(texto) {
  const t = normalizar(texto)
  return VERBOS_ENTRADA.test(t) && hayNumero(t)
}

/**
 * «Cambia el precio del pan a 25» (Fase L). Exige la palabra «precio»: sin ella
 * «pon el refresco a 60» es un precio de venta dictado, no un cambio de tarifa.
 */
export function esCambioPrecio(texto) {
  const t = normalizar(texto)
  return VERBOS_PRECIO.test(t) && /\bprecios?\b/.test(t) && hayNumero(t)
}

/** «Cierra el cuadre» / «abre el cuadre» (Fase M). Nunca escribe por sí solo. */
export function esCuadreAccion(texto) {
  const t = normalizar(texto)
  return /^(?:abre|abrir|abreme|cierra|cerrar|cierralo)\b/.test(t) && /\bcuadre\b/.test(t)
}

/**
 * «Pasa 5 panes del almacén al quiosco» (Fase N). Exige que se nombre una
 * ubicación: sin eso, «pasa 5 panes» sigue siendo una venta.
 */
export function esTraspaso(texto) {
  const t = normalizar(texto)
  return VERBOS_TRASPASO.test(t) && /\b(?:quiosco|almacen)\b/.test(t)
}

/** Slots de entrada al almacén: producto, cantidad y precio de compra. */
function extraerEntradaSlots(transcript, lexico) {
  const texto = normalizar(transcript)
    .replace(VERBOS_ENTRADA, ' ')
    .replace(/^\s*(?:de|del)\s+/, ' ')
  const { slots } = extraerBase(texto, false, lexico)
  return {
    productoHint: slots.productoHint,
    cantidad: slots.cantidad,
    precioUnitario: slots.precioUnitario
  }
}

/** Slots del cambio de precio: producto y precio nuevo. */
function extraerCambioPrecioSlots(transcript, lexico) {
  const texto = normalizar(transcript).replace(VERBOS_PRECIO, ' ')
  const { slots } = extraerBase(texto, false, lexico)
  const productoHint = slots.productoHint
    .replace(/\bprecios?\b/g, ' ')
    .replace(/\b(?:de|del|la|el|los|las)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { productoHint, precio: slots.precioUnitario }
}

/** Slots del traspaso: producto, cantidad y destino (origen siempre almacén). */
function extraerTraspasoSlots(transcript, lexico) {
  const texto = normalizar(transcript)
  const destino = /\bal\s+almacen\b/.test(texto) ? 'almacen' : 'quiosco'
  const resto = texto
    .replace(VERBOS_TRASPASO, ' ')
    .replace(/\b(?:del|de la|de)\s+(?:almacen|quiosco)\b/g, ' ')
    .replace(/\b(?:al|para el|pal)\s+(?:almacen|quiosco)\b/g, ' ')
  const { slots } = extraerBase(resto, false, lexico)
  return {
    productoHint: slots.productoHint,
    cantidad: slots.cantidad,
    destino
  }
}

/** Acción del cuadre: abrir o cerrar. Una frase suelta nunca cierra. */
function extraerCuadreSlots(transcript) {
  const texto = normalizar(transcript)
  return { accion: /\b(?:cierra|cerrar|cierralo|cierre)\b/.test(texto) ? 'cerrar' : 'abrir' }
}

export function extraerSlots(comando, transcript, lexico = LEXICO_BASE) {
  if (comando === 'entrada_inventario') return extraerEntradaSlots(transcript, lexico)
  if (comando === 'cambio_precio') return extraerCambioPrecioSlots(transcript, lexico)
  if (comando === 'traspaso') return extraerTraspasoSlots(transcript, lexico)
  if (comando === 'cuadre_accion') return extraerCuadreSlots(transcript)
  if (comando === 'consulta_stock' || comando === 'consulta_precio') {
    const s = extraerConsultaPura(normalizar(transcript))
    return { productoHint: s.productoHint, ubicacion: s.ubicacion }
  }
  if (comando === 'consulta_deuda') return extraerDeudaSlots(transcript)
  if (comando === 'cobro_deuda') return extraerCobroSlots(transcript)
  if (comando === 'consulta_dia' || comando === 'consulta_ganancia') {
    const fecha = resolverFechaDictada(transcript)
    return { fecha: fecha?.iso ?? null }
  }
  if (comando === 'consulta_caja') return {}
  if (comando === 'venta_fiada') return extraerFiadoSlots(transcript, lexico)
  if (comando === 'repetir' || comando === 'ayuda') return {}
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
  if ((baseComando === 'venta_directa' || baseComando === 'consulta_stock' || baseComando === 'consulta_precio') && base?.elegido) {
    return baseIndice
  }

  const validas = lista.slice(1).filter(x => x && x.comando !== 'desconocido' && x.elegido === true)

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
 * Ubicación de la venta dictada: la que se dijo o, si no se dijo, el **almacén**.
 *
 * La pantalla ya no decide: con la venta por voz siempre se compromete almacén
 * salvo que se pida el quiosco. El formulario muestra la ubicación antes de
 * confirmar, así que no hay sitio para vender en silencio en el lugar equivocado.
 */
export function resolverUbicacion(slots) {
  return { ubicacion: slots?.ubicacion ?? 'almacen' }
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
