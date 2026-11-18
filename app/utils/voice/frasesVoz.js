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

/** Importe para leer en voz alta: "20" o "12,50" (coma decimal, como se habla). */
export function formatearImporte(importe) {
  const monto = Math.round(Number(importe) * 100) / 100
  if (!Number.isFinite(monto) || monto <= 0) return null
  return Number.isInteger(monto) ? String(monto) : monto.toFixed(2).replace('.', ',')
}

/** Frase del read-back antes de vender. `importe` es opcional. */
export function fraseVenta({ cantidad, nombre, lugar, importe = null }) {
  const n = Math.trunc(Number(cantidad) || 0)
  if (n < 1) return `Confirma la venta del ${lugar}.`
  const base = `Voy a vender ${describirCantidad(n, nombre)} del ${lugar}`
  const monto = formatearImporte(importe)
  return monto ? `${base} por ${monto} pesos.` : `${base}.`
}

/**
 * Frase del read-back de una venta con varias líneas. Nombra cada producto en
 * orden y cierra con el total, que es la cifra que delata una cantidad mal
 * oída. La confirmación va en la misma locución.
 */
export function fraseVentaMultiple({ lineas = [], lugar = 'almacén', importe = null }) {
  const partes = (lineas ?? [])
    .filter(l => Math.trunc(Number(l?.cantidad) || 0) > 0)
    .map(l => describirCantidad(l.cantidad, l.nombre))
  if (!partes.length) return `Confirma la venta del ${lugar}.`
  const cuerpo = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
  const monto = formatearImporte(importe)
  const cola = monto ? ` por ${monto} pesos.` : '.'
  return `Voy a vender ${cuerpo} del ${lugar}${cola}`
}

/** Frases de los comandos asistidos (K, L, M, N). Ninguna pide un «sí»:
 *  el jefe confirma en el formulario. */
export function fraseEntrada({ cantidad, nombre, precio = null }) {
  const n = Math.trunc(Number(cantidad) || 0)
  const cuerpo = n > 0
    ? `Entrada de ${describirCantidad(n, nombre)} al almacén`
    : 'Entrada al almacén'
  const monto = formatearImporte(precio)
  const cola = monto ? ` a ${monto} pesos.` : '. No dijiste el costo: uso el último.'
  return `${cuerpo}${cola} Revisa y confirma.`
}

export function fraseCambioPrecio({ nombre, actual = null, nuevo = null }) {
  const base = String(nombre ?? '').trim() || 'ese producto'
  const hoy = formatearImporte(actual)
  const va = formatearImporte(nuevo)
  const arranque = hoy ? `${base} cuesta ${hoy} pesos.` : `Precio de ${base}.`
  if (!va) return `${arranque} Dime cuánto lo pongo.`
  return `${arranque} Lo voy a poner en ${va} pesos. Revisa y confirma.`
}

export function fraseTraspaso({ cantidad, nombre }) {
  const n = Math.trunc(Number(cantidad) || 0)
  const cuerpo = n > 0
    ? `Traspaso de ${describirCantidad(n, nombre)} del almacén al quiosco.`
    : 'Traspaso del almacén al quiosco.'
  return `${cuerpo} Revisa y confirma.`
}

/** Alta de cliente por voz. */
export function fraseClienteAlta({ nombre }) {
  const quien = String(nombre ?? '').trim() || 'el cliente'
  return `Voy a agregar el cliente ${quien}. Revisa y confirma.`
}

/**
 * Merma o devolución al almacén. El motivo se dice: es lo que distingue «rotos»
 * de «vencidos» cuando el jefe revise el inventario dentro de un mes.
 */
export function fraseAjuste({ tipo = 'merma', cantidad, nombre, motivo = '', lugar = 'almacen' }) {
  const n = Math.trunc(Number(cantidad) || 0)
  const donde = lugar === 'quiosco' ? 'quiosco' : 'almacén'
  const razon = String(motivo ?? '').trim()
  const cola = razon ? ` Motivo: ${razon}.` : ''
  if (tipo === 'devolucion') {
    return `Voy a devolver ${describirCantidad(n, nombre)} del quiosco al almacén.${cola} Revisa y confirma.`
  }
  return `Voy a dar de baja ${describirCantidad(n, nombre)} del ${donde}.${cola} Revisa y confirma.`
}

/** Alta de producto: el formulario se abre prellenado y se guarda a mano. */
export function fraseProductoAlta({ nombre, precio = null }) {
  const cual = String(nombre ?? '').trim() || 'un producto'
  const monto = formatearImporte(precio)
  return monto
    ? `Voy a crear el producto ${cual} a ${monto} pesos. Revisa y confirma.`
    : `Voy a crear el producto ${cual}. Revisa y confirma.`
}

/**
 * Mover un producto: la única acción sin formulario, así que siempre se lee y
 * siempre pide confirmación.
 */
export function fraseMover({ nombre, referencia = null, posicion = 'final' }) {
  const base = String(nombre ?? '').trim() || 'ese producto'
  const ref = String(referencia ?? '').trim()
  if (posicion === 'debajo' && ref) return `Voy a poner ${base} justo debajo de ${ref}. Responde sí para confirmar.`
  if (posicion === 'encima' && ref) return `Voy a poner ${base} justo encima de ${ref}. Responde sí para confirmar.`
  if (posicion === 'principio') return `Voy a poner ${base} al principio del catálogo. Responde sí para confirmar.`
  return `Voy a mandar ${base} al final del catálogo. Responde sí para confirmar.`
}

/**
 * Cuadre por voz: solo lleva al cuadre y lee lo que hay. El cierre nunca lo hace
 * la voz; el jefe escribe el dinero real y pulsa el botón. Sin cuadre abierto no
 * se da ninguna instrucción de cierre.
 */
export function fraseCuadre({ accion, hablaCaja = '', sinCuadre = false }) {
  const base = String(hablaCaja ?? '').trim()
  if (sinCuadre) return base || 'No hay un cuadre abierto.'
  if (accion === 'cerrar') {
    const cola = 'Para cerrarlo, escribe el dinero real en caja y pulsa Cerrar cuadre. La voz no cierra el cuadre.'
    return base ? `${base} ${cola}` : cola
  }
  return base ? `Te llevo al cuadre. ${base}` : 'Te llevo al cuadre.'
}

/** Aviso cuando piden más de lo que hay. */
export function fraseStockInsuficiente({ disponible, nombre, lugar }) {
  const base = String(nombre ?? '').trim() || 'ese producto'
  const n = Math.trunc(Number(disponible) || 0)
  if (n <= 0) return `No hay ${base} en el ${lugar}.`
  return `Solo hay ${unidadesDe(n, base)} en el ${lugar}.`
}

export const FRASE_CONFIRMAR = 'Diga sí para confirmar.'

/** Frase del read-back antes de cobrar una deuda. */
export function fraseCobro({ cliente, monto, restante = 0 }) {
  const quien = String(cliente ?? '').trim() || 'ese cliente'
  const cobrado = formatearImporte(monto)
  const queda = Number(restante) || 0
  const cuerpo = cobrado ? `Cobro ${cobrado} pesos a ${quien}.` : `Cobro la deuda de ${quien}.`
  const cola = queda > 0
    ? `Le quedan ${formatearImporte(queda)} pesos.`
    : 'Queda saldada.'
  return `${cuerpo} ${cola} ${FRASE_CONFIRMAR}`
}

/** Frase del read-back antes de fiar. Lleva la confirmación en la misma locución. */
export function fraseFiado({ cantidad, nombre, cliente, importe = null }) {
  const n = Math.trunc(Number(cantidad) || 0)
  const quien = String(cliente ?? '').trim() || 'ese cliente'
  const base = n < 1
    ? `Voy a fiar a ${quien}`
    : `Voy a fiar ${describirCantidad(n, nombre)} a ${quien}`
  const monto = formatearImporte(importe)
  const cuerpo = monto ? `${base} por ${monto} pesos.` : `${base}.`
  return `${cuerpo} ${FRASE_CONFIRMAR}`
}

/** Frase del read-back antes de anotar una deuda de dinero (sin producto). */
export function fraseDeudaDinero({ cliente, monto }) {
  const quien = String(cliente ?? '').trim() || 'ese cliente'
  const importe = formatearImporte(monto)
  return `Voy a anotar que ${quien} debe ${importe} pesos en el cuadre. ${FRASE_CONFIRMAR}`
}

/** Frase del read-back antes de registrar una transferencia al cuadre. */
export function fraseTransferencia({ cliente, monto }) {
  const quien = String(cliente ?? '').trim() || 'sin cliente'
  const importe = formatearImporte(monto)
  return `Voy a registrar una transferencia de ${importe} pesos de ${quien}. ${FRASE_CONFIRMAR}`
}

/** Ayuda hablada: qué sabe hacer el asistente. */
export const FRASE_AYUDA = 'Puedo vender, fiar, cobrar, consultar stock, precios, deudas y las ventas del día, y prellenar entradas, precios, traspasos, mermas y productos. Prueba: vende dos panes; fía dos panes a Juan; cobra 200 a Juan; entraron 20 panes a 10 pesos.'

/** No hay respuesta previa que repetir. */
export const FRASE_NADA_QUE_REPETIR = 'No tengo nada que repetir todavía.'
