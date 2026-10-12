/**
 * shared/inventario/operaciones.js — Constructores transaccionales del inventario.
 *
 * Lógica pura (sin Vue, sin Drizzle, sin Capacitor): recibe datos + filas ya
 * leídas y devuelve objetos listos para insertar/actualizar. La usan tanto los
 * endpoints del servidor (dentro de db.transaction) como el composable offline
 * (dentro de db.transaction local). Así ambas vías aplican idénticas reglas.
 *
 * Convenciones:
 * - Tiempos en epoch ms. makePgCtx convierte número→Date solo.
 * - Cantidades siempre enteras, siempre positivas en `cantidad`.
 * - Dinero redondeado a 2 decimales por importe.
 */

import { consumirFIFO } from './fifo.js'
import { aEpoch } from '../fechas.js'

export function generarId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function redondear2(n) {
  return Math.round(Number(n) * 100) / 100
}

/**
 * Negativo de un delta, evitando -0 (que rompe comparaciones estrictas y
 * serializa distinto a 0 en algunos clientes).
 */
function opuesto(n) {
  const v = Math.trunc(Number(n) || 0)
  return v === 0 ? 0 : -v
}

function compararLotes(a, b) {
  const fa = String(a.fechaEntrada ?? '')
  const fb = String(b.fechaEntrada ?? '')
  if (fa !== fb) return fa < fb ? -1 : 1
  return aEpoch(a.creadoEn) - aEpoch(b.creadoEn)
}

/**
 * Lotes con saldo positivo en una ubicación, ordenados FIFO.
 * @param {Array} lotes — filas de lotes (las anuladas se filtran aquí)
 * @param {Array} movimientos — movimientos no anulados
 * @param {string} productoId
 * @param {'almacen'|'quiosco'} ubicacion
 * @returns {Array<{ id, productoId, precioUnitario, saldo }>}
 */
export function lotesConSaldo(lotes, movimientos, productoId, ubicacion) {
  const clave = ubicacion === 'almacen' ? 'deltaAlmacen' : 'deltaQuiosco'
  const porLote = new Map()
  for (const m of movimientos) {
    if (m.anulado || !m.loteId || m.productoId !== productoId) continue
    porLote.set(m.loteId, (porLote.get(m.loteId) ?? 0) + Math.trunc(Number(m[clave]) || 0))
  }
  return lotes
    .filter(l => l.productoId === productoId && !l.anulado)
    .map(l => ({
      id: l.id,
      productoId: l.productoId,
      precioUnitario: Number(l.precioUnitario) || 0,
      saldo: porLote.get(l.id) ?? 0,
      fechaEntrada: l.fechaEntrada,
      creadoEn: l.creadoEn
    }))
    .filter(l => l.saldo > 0)
    .sort(compararLotes)
}

/**
 * Saldo por producto y ubicación desde el libro.
 * @returns {Map<string, { almacen: number, quiosco: number }>}
 */
export function saldosPorProducto(movimientos) {
  const saldos = new Map()
  for (const m of movimientos) {
    if (m.anulado) continue
    let s = saldos.get(m.productoId)
    if (!s) {
      s = { almacen: 0, quiosco: 0 }
      saldos.set(m.productoId, s)
    }
    s.almacen += Math.trunc(Number(m.deltaAlmacen) || 0)
    s.quiosco += Math.trunc(Number(m.deltaQuiosco) || 0)
  }
  return saldos
}

/**
 * Entrada al almacén: un lote + un movimiento por línea.
 * @param {object} datos — ya validados por entradaAlmacenSchema
 * @param {object} meta — { puestoId, usuarioId, ahora, entradaRef? }
 */
export function construirEntrada(datos, meta) {
  const ahora = meta.ahora ?? Date.now()
  const entradaRef = meta.entradaRef ?? generarId()
  const lotes = []
  const movimientos = []

  for (const linea of datos.lineas) {
    const cantidad = Math.trunc(Number(linea.cantidad))
    const precioUnitario = Number(linea.precioUnitario) || 0
    const loteId = generarId()
    lotes.push({
      id: loteId,
      puestoId: meta.puestoId,
      productoId: linea.productoId,
      proveedorId: datos.proveedorId ?? null,
      lugarCompra: datos.lugarCompra ?? null,
      fechaEntrada: datos.fechaEntrada,
      cantidadInicial: cantidad,
      precioUnitario,
      detalleCompra: datos.detalleCompra ?? null,
      entradaRef,
      anulado: false,
      notas: datos.notas ?? null,
      creadoPor: meta.usuarioId ?? null,
      creadoEn: ahora,
      actualizadoEn: ahora
    })
    movimientos.push({
      id: generarId(),
      puestoId: meta.puestoId,
      productoId: linea.productoId,
      loteId,
      cuadreId: null,
      lineaCuadreId: null,
      traspasoId: null,
      tipo: 'entrada',
      cantidad,
      deltaAlmacen: cantidad,
      deltaQuiosco: 0,
      precioUnitario,
      importe: redondear2(cantidad * precioUnitario),
      motivo: 'entrada_almacen',
      nota: datos.detalleCompra ?? null,
      usuarioId: meta.usuarioId ?? null,
      anulado: false,
      creadoEn: ahora
    })
  }

  return { entradaRef, lotes, movimientos }
}

/**
 * Traspaso almacén → quiosco con identidad de lote conservada.
 * @param {object} params — { lineas, lotesPorProducto: Map<productoId, lotes[]>, meta }
 * @returns {{ traspaso, movimientos, faltantes }}
 */
export function construirTraspaso({ lineas, lotesPorProducto, meta }) {
  const ahora = meta.ahora ?? Date.now()
  const traspaso = {
    id: generarId(),
    puestoId: meta.puestoId,
    fecha: meta.fecha,
    desde: 'almacen',
    hasta: 'quiosco',
    notas: meta.notas ?? null,
    usuarioId: meta.usuarioId ?? null,
    creadoEn: ahora,
    actualizadoEn: ahora
  }
  const movimientos = []
  const faltantes = []

  for (const linea of lineas) {
    let pendiente = Math.trunc(Number(linea.cantidad) || 0)
    if (pendiente <= 0) continue
    const disponibles = lotesPorProducto.get(linea.productoId) ?? []
    const total = disponibles.reduce((s, l) => s + l.saldo, 0)
    if (total < pendiente) {
      faltantes.push({ productoId: linea.productoId, pedido: pendiente, disponible: total })
      continue
    }
    for (const lote of disponibles) {
      if (pendiente <= 0) break
      const toma = Math.min(lote.saldo, pendiente)
      movimientos.push({
        id: generarId(),
        puestoId: meta.puestoId,
        productoId: linea.productoId,
        loteId: lote.id,
        cuadreId: null,
        lineaCuadreId: null,
        traspasoId: traspaso.id,
        tipo: 'traspaso',
        cantidad: toma,
        deltaAlmacen: -toma,
        deltaQuiosco: toma,
        precioUnitario: lote.precioUnitario,
        importe: redondear2(toma * lote.precioUnitario),
        motivo: 'reposicion_quiosco',
        nota: meta.notas ?? null,
        usuarioId: meta.usuarioId ?? null,
        anulado: false,
        creadoEn: ahora
      })
      pendiente -= toma
    }
  }

  return { traspaso, movimientos, faltantes }
}

/**
 * Venta de un cuadre: descuenta FIFO del quiosco por línea (orden secuencia).
 * @param {object} params — { lineas, lotesPorProducto, cuadreId, meta }
 * lineas: [{ id, productoId, cantidad }] ya ordenadas por secuencia.
 */
export function construirVentaCuadre({ lineas, lotesPorProducto, cuadreId, meta }) {
  const ahora = meta.ahora ?? Date.now()
  const movimientos = []
  const agrupadas = new Map()
  for (const l of lineas) {
    const cant = Math.trunc(Number(l.cantidad) || 0)
    if (cant <= 0) continue
    if (!agrupadas.has(l.productoId)) agrupadas.set(l.productoId, [])
    agrupadas.get(l.productoId).push({ lineaId: l.id, productoId: l.productoId, cantidad: cant })
  }

  let costoTotal = 0
  const faltantes = []

  for (const [productoId, filas] of agrupadas) {
    const disponibles = (lotesPorProducto.get(productoId) ?? []).map(l => ({
      id: l.id,
      precioUnitario: l.precioUnitario,
      saldoDisponible: l.saldo
    }))
    const { repartos, faltantes: falt, costoTotal: costo } = consumirFIFO(disponibles, filas)
    costoTotal = redondear2(costoTotal + costo)
    for (const f of falt) faltantes.push(f)
    for (const r of repartos) {
      movimientos.push({
        id: generarId(),
        puestoId: meta.puestoId,
        productoId,
        loteId: r.loteId,
        cuadreId,
        lineaCuadreId: r.lineaId,
        traspasoId: null,
        tipo: 'venta',
        cantidad: r.cantidad,
        deltaAlmacen: 0,
        deltaQuiosco: -r.cantidad,
        precioUnitario: r.precioUnitario,
        importe: r.importe,
        motivo: 'venta_cuadre',
        nota: null,
        usuarioId: meta.usuarioId ?? null,
        anulado: false,
        creadoEn: ahora
      })
    }
  }

  return { movimientos, costoTotal, faltantes }
}

/**
 * Salida de mercancía fuera del cuadre: venta directa en efectivo o deuda
 * directa. A diferencia de construirVentaCuadre, aquí el jefe elige de qué
 * ubicación se descuenta (lo normal, el almacén) y las líneas conservan el
 * costo FIFO por línea, para poder auditar la ganancia después.
 *
 * No toca ningún cuadre: cuadreId y lineaCuadreId van en null porque el
 * efectivo nunca entra a una gaveta.
 *
 * @param {object} params — { lineas, lotesPorProducto, ubicacion, motivo, meta }
 * lineas: [{ id, productoId, cantidad, precioVentaUsado, secuencia }]
 * @returns {{ items, movimientos, montoTotal, costoTotal, ganancia, faltantes }}
 */
export function construirVentaDirecta({ lineas, lotesPorProducto, ubicacion = 'almacen', motivo, ventaId, meta }) {
  const ahora = meta.ahora ?? Date.now()
  // ventaId solo se pasa en ventas directas: una deuda directa no tiene fila
  // en ventas_directas, y sus movimientos deben dejar la referencia en null.
  const refVenta = ventaId ?? null
  const movimientos = []
  const items = []
  let montoTotal = 0
  let costoTotal = 0
  const faltantes = []

  const ordenadas = [...(lineas ?? [])]
    .filter(l => Math.trunc(Number(l.cantidad) || 0) > 0)
    .sort((a, b) => Number(a.secuencia ?? 0) - Number(b.secuencia ?? 0))

  for (const l of ordenadas) {
    const cant = Math.trunc(Number(l.cantidad) || 0)
    const precio = Number(l.precioVentaUsado) || 0
    const subtotal = redondear2(cant * precio)

    const disponibles = (lotesPorProducto.get(l.productoId) ?? []).map(x => ({
      id: x.id,
      precioUnitario: x.precioUnitario,
      saldoDisponible: x.saldo
    }))
    const { repartos, faltantes: falt, costoTotal: costo } = consumirFIFO(disponibles, [
      { lineaId: l.id, productoId: l.productoId, cantidad: cant }
    ])

    if (falt.length > 0) faltantes.push(...falt)
    costoTotal = redondear2(costoTotal + costo)

    // El costo unitario es promedio ponderado de los lotes que consumió esta
    // línea: si la cantidad pedida no se pudo cubrir, el costo se reparte
    // solo sobre lo realmente servido (nunca sobre la cantidad fantasma).
    const servido = repartos.reduce((s, r) => s + r.cantidad, 0)
    const costoUnitario = servido > 0 ? redondear2(costo / servido) : 0

    items.push({
      id: l.id ?? generarId(),
      productoId: l.productoId,
      cantidad: cant,
      precioVentaUsado: precio,
      subtotal,
      costoUnitario,
      costoTotal: costo,
      secuencia: Number(l.secuencia ?? 0),
      creadoEn: ahora
    })
    montoTotal = redondear2(montoTotal + subtotal)

    for (const r of repartos) {
      movimientos.push({
        id: generarId(),
        puestoId: meta.puestoId,
        productoId: l.productoId,
        loteId: r.loteId,
        cuadreId: null,
        lineaCuadreId: null,
        traspasoId: null,
        tipo: 'venta',
        cantidad: r.cantidad,
        ventaDirectaId: refVenta,
        deltaAlmacen: ubicacion === 'almacen' ? -r.cantidad : 0,
        deltaQuiosco: ubicacion === 'quiosco' ? -r.cantidad : 0,
        precioUnitario: r.precioUnitario,
        importe: r.importe,
        motivo: motivo ?? (ubicacion === 'almacen' ? 'venta_directa_almacen' : 'venta_directa_quiosco'),
        nota: null,
        usuarioId: meta.usuarioId ?? null,
        anulado: false,
        creadoEn: ahora
      })
    }
  }

  return {
    items,
    movimientos,
    montoTotal,
    costoTotal,
    ganancia: redondear2(montoTotal - costoTotal),
    faltantes
  }
}

/**
 * Identifica la venta que un movimiento (de venta o de anulación) representa.
 *
 * La venta de un cuadre sale del consumo FIFO: una línea se reparte entre
 * varios lotes, así que la clave incluye el lote. La cantidad completa la
 * identidad porque dos ventas del mismo lote pueden tener distinto tamaño
 * (la línea se partió entre varios lotes, por ejemplo).
 */
function claveAnulacion(m) {
  return [
    m.productoId ?? '',
    m.loteId ?? '',
    m.lineaCuadreId ?? '',
    Math.trunc(Number(m.cantidad) || 0)
  ].join('|')
}

/** Fecha de un movimiento en epoch ms, tolerando número, ISO o Date. */
function msMovimiento(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = new Date(v ?? 0).getTime()
  return Number.isFinite(n) ? n : 0
}

/**
 * Anulación de los movimientos de venta de un cuadre (reapertura).
 *
 * El original NO se marca anulado: sigue contabilizando su delta y es la
 * contramovimiento quien lo cancela (neto cero). Marcarlo además de insertar
 * el inverso haría que el original dejara de contar y el saldo quedara
 * desviado justo por la cantidad anulada.
 *
 * Por eso mismo, "no está anulado" NO significa "sigue viva": una venta
 * neutralizada por una reapertura anterior sigue en el libro con
 * `anulado = false`, y es su contramovimiento la que la compensa. Si una
 * segunda reapertura invirtiera todas las ventas otra vez, el stock volvería
 * al quiosco dos veces y la venta del día dejaría de descontarse.
 *
 * Aquí solo se invierten las ventas VIVAS (ver auditarAnulacionesCuadre), que
 * son exactamente lo que este cierre tiene que devolver, por muchas veces que
 * se haya reabierto el cuadre.
 *
 * `movimientosPrevios` debe traer los movimientos del cuadre tal como están,
 * ventas Y anulaciones (los dos llamadores ya los leen así: cuadreId + no
 * anulados). Si solo llegaran ventas, el resultado sería el de siempre.
 *
 * La columna `anulado` queda reservada para invalidar un movimiento sin
 * contrapartida (registros defectuosos, importaciones), no para este flujo.
 */
export function construirAnulacionCuadre({ movimientosPrevios, meta }) {
  const ahora = meta.ahora ?? Date.now()
  const { vivas } = auditarAnulacionesCuadre(movimientosPrevios)
  const anulaciones = vivas.map(m => ({
    id: generarId(),
    puestoId: m.puestoId,
    productoId: m.productoId,
    loteId: m.loteId,
    cuadreId: m.cuadreId,
    lineaCuadreId: m.lineaCuadreId,
    traspasoId: null,
    tipo: 'anulacion',
    cantidad: m.cantidad,
    deltaAlmacen: opuesto(m.deltaAlmacen),
    deltaQuiosco: opuesto(m.deltaQuiosco),
    precioUnitario: Number(m.precioUnitario) || 0,
    importe: Number(m.importe) || 0,
    motivo: 'reapertura_cuadre',
    nota: null,
    usuarioId: meta.usuarioId ?? null,
    anulado: false,
    creadoEn: ahora
  }))
  return { anulaciones }
}

/**
 * Separa los movimientos de un cuadre en ventas VIVAS y anulaciones sobrantes.
 *
 * Es la regla de las reaperturas, en un solo sitio y sin efectos: el cierre
 * la usa para decidir a qué ventas devuelve el stock, y el script de reparación
 * (scripts/reparar-reaperturas.mjs) la usa para auditar y arreglar bases ya
 * escritas. Así la app y el script no pueden decidir distinto qué es una venta
 * viva.
 *
 * - vivas: ventas del cuadre que ninguna anulación ha neutralizado todavía.
 *   Reabrir un cuadre devuelve estas y solo estas.
 * - sobrantes: anulaciones que no encuentran venta que neutralizar, porque la
 *   venta que copiaaron ya estaba cancelada por una reapertura anterior. Es la
 *   firma del descuadre: devuelven stock dos veces.
 *
 * El emparejamiento es CRONOLÓGICO, no un simple recuento. Cuenta porque una
 * anulación nunca precede a la venta que copia: el cierre va primero y la
 * reapertura después. Recorrer el libro en orden deja que cada anulación se
 * coma la venta viva más antigua de su línea y, cuando ya no queda ninguna,
 * se reconozca como sobrante. Solo contando por clave el descuadre sería
 * invisible: tres ventas con tres anulaciones (una de ellas duplicada) se ven
 * exactamente igual que tres cierres con sus tres reaperturas.
 *
 * @param {Array} movimientos — movimientos del cuadre (cualquier orden)
 * @returns {{ vivas: Array, sobrantes: Array }}
 */
export function auditarAnulacionesCuadre(movimientos = []) {
  const lista = (movimientos ?? []).filter(m => m && !m.anulado)
  // Sort estable: a igual creadoEn se respeta el orden de llegada.
  const orden = [...lista].sort((a, b) => msMovimiento(a.creadoEn) - msMovimiento(b.creadoEn))

  // Una venta entra al libro en el pendiente de su línea y sale de él cuando
  // una anulación posterior la neutraliza. Lo que sobre al final son las vivas.
  const pendientes = new Map()
  const sobrantes = []
  for (const m of orden) {
    if (m.tipo === 'venta') {
      const clave = claveAnulacion(m)
      if (!pendientes.has(clave)) pendientes.set(clave, [])
      pendientes.get(clave).push(m)
    } else if (m.tipo === 'anulacion') {
      const grupo = pendientes.get(claveAnulacion(m))
      if (grupo?.length) grupo.shift()
      else sobrantes.push(m)
    }
  }

  const vivas = []
  for (const grupo of pendientes.values()) vivas.push(...grupo)
  return { vivas, sobrantes }
}

/**
 * Merma (pierde stock) o devolución (quiosco → almacén), con FIFO por lote.
 * @param {object} params — { productoId, tipo, ubicacion, cantidad, motivo, nota,
 *   lotesOrdenados, meta }
 * Para merma en almacén se usa lotesOrdenados del almacén; para merma en
 * quiosco o devolución, los del quiosco.
 */
export function construirAjuste({ productoId, tipo, ubicacion, cantidad, motivo, nota, lotesOrdenados, meta }) {
  const ahora = meta.ahora ?? Date.now()
  let pendiente = Math.trunc(Number(cantidad) || 0)
  const movimientos = []
  const total = (lotesOrdenados ?? []).reduce((s, l) => s + l.saldo, 0)
  if (total < pendiente) {
    return { movimientos, faltante: { productoId, pedido: pendiente, disponible: total } }
  }
  for (const lote of lotesOrdenados) {
    if (pendiente <= 0) break
    const toma = Math.min(lote.saldo, pendiente)
    const esDevolucion = tipo === 'devolucion'
    movimientos.push({
      id: generarId(),
      puestoId: meta.puestoId,
      productoId,
      loteId: lote.id,
      cuadreId: null,
      lineaCuadreId: null,
      traspasoId: null,
      tipo,
      cantidad: toma,
      deltaAlmacen: esDevolucion ? toma : (ubicacion === 'almacen' ? -toma : 0),
      deltaQuiosco: esDevolucion ? -toma : (ubicacion === 'quiosco' ? -toma : 0),
      precioUnitario: lote.precioUnitario,
      importe: redondear2(toma * lote.precioUnitario),
      motivo,
      nota: nota ?? null,
      usuarioId: meta.usuarioId ?? null,
      anulado: false,
      creadoEn: ahora
    })
    pendiente -= toma
  }
  return { movimientos, faltante: null }
}
