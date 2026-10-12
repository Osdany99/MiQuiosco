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

// --------------------------------------------- corrección de lotes ----

/**
 * Saldos de cada lote según el libro (movimientos no anulados).
 *
 * Es la única forma de calcular "cuánto queda de este lote" en los tres sitios
 * que lo necesitan —el GET /api/lotes, el diálogo de corrección y el respaldo
 * offline del sqlite— para que no puedan discrepar entre sí.
 *
 * @returns {Map<string, { almacen:number, quiosco:number, consumido:boolean }>}
 */
export function saldosPorLote(movimientos) {
  const porLote = new Map()
  for (const m of movimientos ?? []) {
    if (!m?.loteId || m.anulado) continue
    let s = porLote.get(m.loteId)
    if (!s) {
      s = { almacen: 0, quiosco: 0, consumido: false }
      porLote.set(m.loteId, s)
    }
    const da = Math.trunc(Number(m.deltaAlmacen) || 0)
    const dq = Math.trunc(Number(m.deltaQuiosco) || 0)
    s.almacen += da
    s.quiosco += dq
    if (da < 0 || dq < 0) s.consumido = true
  }
  return porLote
}

/**
 * Estado de un lote y las dos cifras que gobiernan su corrección.
 *
 * `salidasAlmacen` son las unidades que YA dejaron el almacén de este lote
 * (traspasos, ventas directas de almacén, mermas; las devoluciones suman
 * porque vuelven, por eso es una suma neta y no un recuento).
 *
 * `piso` es el mínimo que puede declarar la cantidad corregida: no se puede
 * decir que el lote traía menos unidades de las que ya se fueron, porque el
 * almacén quedaría en negativo. Solo mira el almacén, así que lo que hay en el
 * quiosco no restringe nada: corregir un lote nunca puede tocar el quiosco.
 */
export function saldosDeLote(lote, movimientos) {
  const lista = (movimientos ?? []).filter(m => m && !m.anulado && m.loteId === lote?.id)
  const entradas = lista.filter(m => m.tipo === 'entrada')
  const suma = (clave, filas) => filas.reduce((s, m) => s + Math.trunc(Number(m[clave]) || 0), 0)

  const almacen = suma('deltaAlmacen', lista)
  const quiosco = suma('deltaQuiosco', lista)
  // Suma neta de lo que salió del almacén SIN contar la entrada. Puede salir
  // negativa si hubo devoluciones (quiosco → almacén), que es justo lo que hace
  // que `piso` sea un máximo y no un recorte: solo importa que no seDeclare
  // menos de lo que ya se fue.
  const salidas = suma('deltaAlmacen', lista.filter(m => m.tipo !== 'entrada'))
  const salidasAlmacen = Math.max(0, -salidas)

  return {
    almacen,
    quiosco,
    consumido: lista.some(m => (Math.trunc(Number(m.deltaAlmacen) || 0) < 0 || Math.trunc(Number(m.deltaQuiosco) || 0) < 0)),
    entradas,
    entrada: entradas[0] ?? null,
    salidas,
    salidasAlmacen,
    piso: salidasAlmacen
  }
}

/**
 * Corrección de una entrada ya registrada: cantidad y/o precio.
 *
 * El precio de compra vive en el lote (es su único origen) y la cantidad
 * vive en el libro: `lotes.cantidadInicial` es una cabecera, pero el stock lo
 * dan los `deltaAlmacen` del libro. Por eso corregir la cantidad es corregir
 * el movimiento de entrada y no solo la cabecera —si setocara solo la
 * cabecera, el stock no se movería y el historial quedaría mintiendo.
 *
 * Qué se reescribe, y qué no:
 * - La fila tipo 'entrada' del lote: es la compra. Pasa a valer la cantidad y
 *   el precio correctos, con su importe recalculado. Su `creadoEn` NO se
 *   toca, así que la compra sigue fechada el día que ocurrió y la gráfica de
 *   compras de ese día muestra la cifra buena en vez de recibir un movimiento
 *   con la fecha de hoy.
 * - Nada más. Los traspasos, ventas, mermas y devoluciones quedan congelados:
 *   un cuadre cerrado y una venta directa ya guardaron su costo, y reescribir
 *   sus movimientos movería la historia que ya se dio por buena. El libro
 *   sigue siendo append-only para todo lo que ya pasó; aquí solo se corrige
 *   el registro de lo que entró.
 *
 * El inventario del quiosco no se toca nunca: el delta de la entrada en esa
 * ubicación es 0 y no se escribe ninguno. Si del lote ya hay mercadería en el
 * quiosco, esa mercadería conserva su saldo y sus valuaciones.
 *
 * @param {object} params — { lote, movimientos, datos, meta }
 *   `datos`: { cantidadInicial?, precioUnitario?, motivo } (ya validados por
 *   correccionLoteSchema). `null`/ausente = ese campo no se toca.
 * @returns {{
 *   cambiosLote: object,
 *   movimientosActualizados: Array<object>,
 *   almacen: number, quiosco: number,
 *   piso: number, salidasAlmacen: number, consumido: boolean,
 *   cambiaCantidad: boolean, cambiaPrecio: boolean
 * }}
 * @throws {Error} con el mensaje en español, listo para mostrar al jefe.
 */
export function construirCorreccionLote({ lote, movimientos, datos, meta = {} }) {
  const ahora = meta.ahora ?? Date.now()
  if (!lote) throw new Error('Lote no encontrado.')
  if (lote.anulado) throw new Error('El lote está anulado.')

  const s = saldosDeLote(lote, movimientos)

  const cantidad = datos.cantidadInicial == null ? null : Math.trunc(Number(datos.cantidadInicial))
  const precio = datos.precioUnitario == null ? null : Number(datos.precioUnitario)

  if (cantidad != null && !Number.isFinite(cantidad)) throw new Error('La cantidad no es válida.')
  if (cantidad != null && cantidad < s.piso) {
    throw new Error(
      `No se puede bajar a ${cantidad}: de este lote ya salieron ${s.salidasAlmacen} `
      + `unidades del almacén. El mínimo es ${s.piso}.`
    )
  }

  const cambiaCantidad = cantidad != null && cantidad !== Math.trunc(Number(lote.cantidadInicial))
  const cambiaPrecio = precio != null && precio !== Number(lote.precioUnitario)
  if (!cambiaCantidad && !cambiaPrecio) {
    throw new Error('No hay nada que corregir: esos ya son los valores del lote.')
  }

  const cambiosLote = { actualizadoEn: ahora }
  if (cambiaCantidad) cambiosLote.cantidadInicial = cantidad
  if (cambiaPrecio) cambiosLote.precioUnitario = precio

  const movimientosActualizados = []
  if (s.entradas.length > 1) {
    throw new Error('Este lote tiene varias entradas en el libro y no se puede corregir solo. Revísalo con el jefe.')
  }
  if (cambiaCantidad && !s.entrada) {
    throw new Error('Este lote no tiene su movimiento de entrada en el libro. Corrige el stock con una merma.')
  }
  if (s.entrada && (cambiaCantidad || cambiaPrecio)) {
    // La entrada ES la compra: su deltaAlmacen es su propia cantidad (nunca
    // `-salidas`), así que dejándola en la cantidad corregida el almacén queda
    // en `cantidad - salidas` y el quiosco se queda como estaba.
    const cantFinal = cambiaCantidad ? cantidad : Math.trunc(Number(s.entrada.cantidad) || 0)
    const precioFinal = cambiaPrecio ? precio : (Number(lote.precioUnitario) || 0)
    // Sin `actualizadoEn`: la marca de tiempo es del que escribe (el endpoint
    // la traduce a Date; el sqlite la pone enrichForUpdate).
    movimientosActualizados.push({
      id: s.entrada.id,
      ...(cambiaCantidad ? { cantidad: cantFinal, deltaAlmacen: cantFinal, deltaQuiosco: 0 } : {}),
      precioUnitario: precioFinal,
      importe: redondear2(cantFinal * precioFinal)
    })
  }

  return {
    cambiosLote,
    movimientosActualizados,
    // El almacén queda en `cantidad corregida - lo que ya había salido`, porque
    // la entrada corregida sigue siendo la cantidad y lo que sale no cambia.
    almacen: cambiaCantidad ? cantidad + s.salidas : s.almacen,
    quiosco: s.quiosco,
    piso: s.piso,
    salidasAlmacen: s.salidasAlmacen,
    consumido: s.consumido,
    cambiaCantidad,
    cambiaPrecio
  }
}
