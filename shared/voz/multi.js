/**
 * shared/voz/multi.js — varias líneas en una sola venta dictada (puro).
 *
 * «3 panes y 2 refrescos» se parte en segmentos y cada uno se lee con el mismo
 * extractor de una venta. Solo se usa con la app abierta: el servicio nativo
 * sigue diciendo «De uno en uno».
 *
 * No conoce el catálogo: si un segmento no da producto, cantidad o ubicación
 * coherente, devuelve `null` y el flujo normal decide (sin inventar líneas).
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */
import { LEXICO_BASE } from './lexico.js'
import { extraerSlots } from './gramatica.js'

/** Decenas que se unen con «y» a una unidad: «treinta y cinco». */
const DECENAS = new Set([
  'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'
])
const UNIDADES = new Set([
  'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'
])

function palabras(texto) {
  return String(texto ?? '').split(/\s+/).filter(Boolean)
}

function esNumeroCompuesto(anterior, siguiente) {
  const previas = palabras(anterior)
  const siguientes = palabras(siguiente)
  if (!previas.length || !siguientes.length) return false
  return DECENAS.has(previas[previas.length - 1]) && UNIDADES.has(siguientes[0])
}

/**
 * Parte la frase por comas, «y» y «con», volviendo a unir los números
 * compuestos que el «y» había cortado («treinta y cinco panes»).
 */
export function dividirSegmentos(texto, productos = []) {
  const plano = String(texto ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
  // F3: con contexto de catálogo, no cortar en «con» si hay un producto que
  // contenga esa palabra («Pan con queso»). Sin contexto, comportamiento actual.
  const tieneProductoCon = (productos || []).some((p) => {
    const nombre = String(p?.nombre ?? p ?? '')
    const descripcion = String(p?.descripcion ?? '')
    return /\bcon\b/.test((nombre + ' ' + descripcion).toLowerCase())
  })
  const separador = tieneProductoCon
    ? /\s*,\s*|\s+y\s+/
    : /\s*,\s*|\s+y\s+|\s+con\s+/
  const crudos = plano
    .split(separador)
    .map(p => p.trim())
    .filter(Boolean)

  const partes = []
  for (const parte of crudos) {
    const anterior = partes[partes.length - 1]
    if (anterior && esNumeroCompuesto(anterior, parte)) {
      partes[partes.length - 1] = `${anterior} y ${parte}`
    } else {
      partes.push(parte)
    }
  }
  return partes
}

/**
 * Segmenta una venta con varias líneas.
 *
 * Devuelve `{ tipoVenta, ubicacion, segmentos }` o `null`:
 * - `segmentos` son los slots de cada línea (`productoHint`, `cantidad`,
 *   `precioUnitario`);
 * - ubicación y tipo de venta son comunes a toda la venta (si dos segmentos
 *   dicen cosas distintas, no se adivina: `null`).
 */
export function segmentarVentaMultiple(transcript, lexico = LEXICO_BASE, productos = []) {
  const partes = dividirSegmentos(transcript, productos)
  if (partes.length < 2) return null

  const segmentos = partes.map((parte, indice) => {
    // El extractor espera una frase de venta; las líneas siguientes no repiten
    // el verbo, así que se les pone uno neutro al principio.
    const frase = indice === 0 ? parte : `vende ${parte}`
    const slots = extraerSlots('venta_directa', frase, lexico)
    return {
      texto: parte,
      productoHint: slots?.productoHint ?? '',
      cantidad: Math.max(1, Math.trunc(Number(slots?.cantidad) || 1)),
      precioUnitario: slots?.precioUnitario == null ? null : Number(slots.precioUnitario),
      ubicacion: slots?.ubicacion ?? null,
      tipoVenta: slots?.tipoVenta || 'directa',
      clienteHint: slots?.clienteHint ?? null
    }
  })

  if (segmentos.some(s => !s.productoHint)) return null

  const ubicaciones = new Set(segmentos.map(s => s.ubicacion).filter(Boolean))
  if (ubicaciones.size > 1) return null

  const tipos = new Set(segmentos.map(s => s.tipoVenta || 'directa'))
  if (tipos.size > 1) return null

  return {
    tipoVenta: [...tipos][0] ?? 'directa',
    ubicacion: [...ubicaciones][0] ?? null,
    segmentos
  }
}

/**
 * Agrupa líneas del mismo producto. «2 panes y 3 panes» es un solo renglón de
 * 5: así el stock se compara contra la suma y el formulario no muestra dos
 * filas del mismo producto.
 *
 * Devuelve `null` si dos líneas del mismo producto traen precios distintos: el
 * jefe tendría que decidir cuál vale, y por voz no se adivina.
 */
export function agruparPorProducto(lineas = []) {
  const porProducto = new Map()
  for (const linea of lineas ?? []) {
    const cantidad = Math.trunc(Number(linea?.cantidad) || 0)
    if (cantidad < 1) return null
    const clave = linea.productoId ?? linea.productoHint ?? linea.nombre
    const previa = porProducto.get(clave)
    if (!previa) {
      porProducto.set(clave, { ...linea, cantidad })
      continue
    }
    const precio = linea.precioUnitario ?? linea.precioVentaUsado ?? null
    const precioPrevio = previa.precioUnitario ?? previa.precioVentaUsado ?? null
    if (precio != null && precioPrevio != null && Number(precio) !== Number(precioPrevio)) return null
    previa.cantidad += cantidad
  }
  return [...porProducto.values()]
}
