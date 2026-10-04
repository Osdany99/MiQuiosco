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

function aEpoch(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isNaN(n) ? 0 : n
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
 * Rotación del precio de compra tras una entrada.
 * Si el precio difiere del vigente: cerrar vigente + abrir nuevo + espejo.
 * @returns {null | { cerrarId: string|null, nuevoHistorial: object, espejo: number }}
 */
export function rotarPrecioCompra({ producto, vigente, nuevoPrecio, ahora, usuarioId }) {
  const precio = Number(nuevoPrecio) || 0
  const previoCompra = Number(producto?.precioCompraActual ?? 0)
  const previoVenta = Number(producto?.precioVentaActual ?? 0)
  if (Math.abs(precio - previoCompra) < 0.0001 && vigente) return null

  let vigenteDesde = ahora
  let cerrarId = null
  if (vigente) {
    const vDesde = aEpoch(vigente.vigenteDesde)
    vigenteDesde = Math.max(ahora, vDesde + 1)
    cerrarId = vigente.id
  }
  return {
    cerrarId,
    cerrarHasta: cerrarId ? Math.max(vigenteDesde - 1, aEpoch(vigente.vigenteDesde)) : null,
    nuevoHistorial: {
      id: generarId(),
      productoId: producto.id,
      precioCompra: precio,
      precioVenta: previoVenta,
      vigenteDesde,
      vigenteHasta: null,
      cambiadoPor: usuarioId ?? null,
      creadoEn: ahora,
      actualizadoEn: ahora
    },
    espejo: precio
  }
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
 * Anulación de los movimientos de venta de un cuadre (reapertura).
 *
 * El original NO se marca anulado: sigue contabilizando su delta y es la
 * contramovimiento quien lo cancela (neto cero). Marcarlo además de insertar
 * el inverso haría que el original dejara de contar y el saldo quedara
 * desviado justo por la cantidad anulada.
 *
 * La columna `anulado` queda reservada para invalidar un movimiento sin
 * contrapartida (registros defectuosos, importaciones), no para este flujo.
 */
export function construirAnulacionCuadre({ movimientosPrevios, meta }) {
  const ahora = meta.ahora ?? Date.now()
  const anulaciones = []
  for (const m of movimientosPrevios) {
    if (m.anulado || m.tipo !== 'venta') continue
    anulaciones.push({
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
    })
  }
  return { anulaciones }
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
