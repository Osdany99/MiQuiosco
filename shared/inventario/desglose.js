/**
 * shared/inventario/desglose.js — Desglose de un lote para el diálogo de detalle.
 *
 * Lógica pura (sin Vue, sin DB): recibe las filas ya leídas y devuelve el
 * resumen y las filas agrupadas por tipo de salida. La usan tanto el endpoint
 * `GET /api/lotes/[id]/desglose` como el camino offline de useInventario, así
 * que ambos modos no pueden dar números distintos.
 *
 * Reglas que respeta:
 *  - Reaperturas: los movimientos originales NO se marcan anulados; su
 *    contramovimiento los neutraliza. Por eso las ventas de cuadre se filtran
 *    con auditarAnulacionesCuadre, no con el flag `anulado`.
 *  - Cada movimiento de venta trae `loteId`, así que la atribución al lote es
 *    exacta. El costo del quiosco se reconstruye desde los movimientos de la
 *    línea (cuadre_items no guarda costo).
 *  - Clasificación de precio: normal (por encima del costo), a costo (igual) o
 *    menor (por debajo). Se compara contra el costo FIFO de la línea completa,
 *    no contra el de un lote suelto.
 */

import { auditarAnulacionesCuadre, saldosDeLote } from './operaciones.js'

const EPS = 0.01

function redondear2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Epoch ms tolerando número, Date, ISO y fecha 'YYYY-MM-DD'. */
function aMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    // Mediodía local: una fecha sin hora no debe correrse de día por la zona.
    return new Date(`${v}T12:00:00`).getTime()
  }
  const n = new Date(v).getTime()
  return Number.isFinite(n) ? n : null
}

/**
 * normal = se vendió por encima del costo.
 * aCosto = se vendió al costo (sin ganancia).
 * menor  = se vendió por debajo del costo (pérdida).
 */
function clasificar(precio, costo) {
  const p = Number(precio) || 0
  const c = Number(costo) || 0
  if (Math.abs(p - c) <= EPS) return 'aCosto'
  return p > c ? 'normal' : 'menor'
}

function totalVacio() {
  return { unidades: 0, ingreso: 0, costo: 0, ganancia: 0 }
}

function categoriaVacia() {
  return {
    unidades: 0,
    ingreso: 0,
    costo: 0,
    ganancia: 0,
    normal: totalVacio(),
    aCosto: totalVacio(),
    menor: totalVacio()
  }
}

function acumular(destino, fila) {
  destino.unidades += Number(fila.cantidad) || 0
  destino.ingreso += Number(fila.subtotal) || 0
  destino.costo += Number(fila.costo) || 0
  destino.ganancia += Number(fila.ganancia) || 0
}

function acumularFila(categoria, fila) {
  acumular(categoria, fila)
  if (fila.categoria === 'normal' || fila.categoria === 'aCosto' || fila.categoria === 'menor') {
    acumular(categoria[fila.categoria], fila)
  }
}

function redondearTotal(t) {
  t.unidades = Math.trunc(Number(t.unidades) || 0)
  t.ingreso = redondear2(t.ingreso)
  t.costo = redondear2(t.costo)
  t.ganancia = redondear2(t.ganancia)
  return t
}

function redondearCategoria(c) {
  redondearTotal(c)
  redondearTotal(c.normal)
  redondearTotal(c.aCosto)
  redondearTotal(c.menor)
  return c
}

function porFechaDesc(a, b) {
  return (Number(b.horaMs) || 0) - (Number(a.horaMs) || 0)
}

/**
 * @param {object} datos
 * @param {object} datos.lote — fila de lotes (con nombreProducto/proveedorNombre opcionales)
 * @param {Array} datos.movimientos — movimientos del producto (o del puesto), sin filtrar
 * @param {Array} datos.cuadreItems — líneas de los cuadres tocados
 * @param {Array} datos.cuadres — cuadres tocados
 * @param {Array} datos.ventas — ventas directas tocadas
 * @param {Array} datos.ventaItems — líneas de esas ventas
 * @param {Array} datos.cuentas — cuentas fiado (de cuadre o directas) relacionadas
 * @param {Array} datos.cuentaItems — líneas de esas cuentas
 * @param {Array} datos.clientes — clientes del puesto
 * @param {Array} datos.usuarios — usuarios del puesto
 * @returns {object} resumen y filas por pestaña
 */
export function desgloseDeLote({
  lote,
  movimientos = [],
  cuadreItems = [],
  cuadres = [],
  ventas = [],
  ventaItems = [],
  cuentas = [],
  cuentaItems = [],
  clientes = [],
  usuarios = []
}) {
  const clientePorId = new Map((clientes ?? []).map(c => [c.id, c]))
  const usuarioPorId = new Map((usuarios ?? []).map(u => [u.id, u]))
  const cuadrePorId = new Map((cuadres ?? []).map(c => [c.id, c]))
  const lineaPorId = new Map((cuadreItems ?? []).map(l => [l.id, l]))
  const ventaPorId = new Map((ventas ?? []).map(v => [v.id, v]))
  const ventaItemPorId = new Map((ventaItems ?? []).map(i => [i.id, i]))
  const cuentaItemPorId = new Map((cuentaItems ?? []).map(i => [i.id, i]))
  const cuentaPorId = new Map((cuentas ?? []).map(c => [c.id, c]))

  const nombreCliente = id => clientePorId.get(id)?.nombre ?? null
  const nombreUsuario = id => usuarioPorId.get(id)?.nombre ?? null

  // ---------- Saldos del lote ----------
  const saldo = saldosDeLote(lote, movimientos)
  const entrada = saldo.entrada
  const cantidadEntrada = entrada
    ? Math.trunc(Number(entrada.cantidad) || 0)
    : Math.trunc(Number(lote?.cantidadInicial) || 0)
  const precioCompra = Number(lote?.precioUnitario) || 0

  const movsDelProducto = (movimientos ?? []).filter(
    m => m && m.productoId === lote?.productoId
  )
  const movsDelLote = movsDelProducto.filter(m => m.loteId === lote?.id)

  // ---------- Cliente de una línea de cuadre ----------
  // Una línea fiada del cuadre no guarda el cliente; se resuelve por la cuenta
  // de origen y el producto. Si no hay deuda, la venta fue de mostrador.
  const clientePorCuadreProducto = new Map()
  const itemsPorCuenta = new Map()
  for (const it of cuentaItems ?? []) {
    if (!itemsPorCuenta.has(it.cuentaFiadoId)) itemsPorCuenta.set(it.cuentaFiadoId, [])
    itemsPorCuenta.get(it.cuentaFiadoId).push(it)
  }
  for (const c of cuentas ?? []) {
    if (!c.cuadreOrigenId) continue
    for (const it of itemsPorCuenta.get(c.id) ?? []) {
      clientePorCuadreProducto.set(`${c.cuadreOrigenId}|${it.productoId}`, c.clienteId)
    }
  }

  // ---------- Ventas del quiosco (cuadre) ----------
  // Se auditan las anulaciones con los movimientos del producto: la clave de
  // emparejamiento incluye producto, lote, línea y cantidad.
  const movsCuadre = movsDelProducto.filter(m => m.cuadreId || m.lineaCuadreId)
  const { vivas } = auditarAnulacionesCuadre(movsCuadre)

  // Costo FIFO real de cada línea completa (puede repartirse entre varios lotes).
  const costoPorLinea = new Map()
  for (const m of vivas) {
    if (!m.lineaCuadreId) continue
    const acc = costoPorLinea.get(m.lineaCuadreId) ?? { cantidad: 0, costo: 0 }
    acc.cantidad += Math.abs(Math.trunc(Number(m.cantidad) || 0))
    acc.costo += Number(m.importe) || 0
    costoPorLinea.set(m.lineaCuadreId, acc)
  }

  const filas = {
    quiosco: [],
    directa: [],
    casa: [],
    familiar: [],
    regalo: [],
    merma: [],
    fiado: []
  }

  for (const m of vivas) {
    if (m.loteId !== lote?.id) continue
    const linea = lineaPorId.get(m.lineaCuadreId)
    if (!linea) continue

    const cantidad = Math.abs(Math.trunc(Number(m.cantidad) || 0))
    const precio = Number(linea.precioVentaUsado) || 0
    const acc = costoPorLinea.get(linea.id)
    const costoLinea = acc && acc.cantidad > 0
      ? acc.costo / acc.cantidad
      : Number(m.precioUnitario) || 0
    const costo = Number(m.importe) || 0
    const subtotal = redondear2(cantidad * precio)
    const cuadre = cuadrePorId.get(m.cuadreId)
    const clienteId = clientePorCuadreProducto.get(`${m.cuadreId}|${linea.productoId}`)

    const fila = {
      id: m.id,
      tipo: linea.tipoLinea ?? 'normal',
      fechaMs: aMs(cuadre?.fecha),
      horaMs: aMs(m.creadoEn),
      cantidad,
      precio,
      costoUnitario: redondear2(costoLinea),
      costo: redondear2(costo),
      subtotal,
      ganancia: redondear2(subtotal - costo),
      categoria: clasificar(precio, costoLinea),
      cliente: nombreCliente(clienteId),
      ubicacion: 'quiosco',
      usuario: nombreUsuario(m.usuarioId),
      nota: linea.nota ?? m.nota ?? null,
      origen: 'cuadre'
    }

    // Tipos legacy: se conservan en el historial, pero ya no se crean desde el
    // cuadre. Cada uno tiene su pestaña para no falsear el desglose.
    if ((linea.tipoLinea ?? 'normal') === 'regalo') {
      filas.regalo.push({
        ...fila,
        precio: 0,
        subtotal: 0,
        ganancia: redondear2(-costo),
        categoria: 'regalo'
      })
    } else if ((linea.tipoLinea ?? 'normal') === 'descuento_familiar') {
      filas.familiar.push({ ...fila, categoria: 'familiar' })
    } else {
      filas.quiosco.push(fila)
    }
  }

  // ---------- Ventas directas (efectivo, casa, familiar, regalo) ----------
  const itemsPorVentaProducto = new Map()
  for (const it of ventaItems ?? []) {
    const clave = `${it.ventaDirectaId}|${it.productoId}`
    if (!itemsPorVentaProducto.has(clave)) itemsPorVentaProducto.set(clave, it)
  }

  const movsDirectas = movsDelLote.filter(
    m => !m.anulado && m.tipo === 'venta' && m.ventaDirectaId && !m.cuadreId
  )

  for (const m of movsDirectas) {
    const venta = ventaPorId.get(m.ventaDirectaId)
    if (!venta || venta.anulado) continue

    // Enlace exacto si existe; si no, la única línea del producto en esa venta
    // (la UI vende una línea por venta).
    const item = m.ventaDirectaItemId
      ? ventaItemPorId.get(m.ventaDirectaItemId)
      : itemsPorVentaProducto.get(`${m.ventaDirectaId}|${m.productoId}`)
    if (!item) continue

    const tipoVenta = venta.tipoVenta ?? 'directa'
    const cantidad = Math.abs(Math.trunc(Number(m.cantidad) || 0))
    const precio = Number(item.precioVentaUsado) || 0
    const costo = Number(m.importe) || 0
    const subtotal = redondear2(cantidad * precio)

    const fila = {
      id: m.id,
      tipo: tipoVenta,
      fechaMs: aMs(venta.creadoEn),
      horaMs: aMs(venta.creadoEn),
      cantidad,
      precio,
      costoUnitario: Number(m.precioUnitario) || 0,
      costo: redondear2(costo),
      subtotal,
      ganancia: redondear2(subtotal - costo),
      // La clasificación es de la línea completa (costo congelado al vender),
      // no del lote suelto: así "a costo" significa lo que el jefe quiso cobrar.
      categoria: clasificar(precio, Number(item.costoUnitario) || 0),
      cliente: nombreCliente(venta.clienteId),
      ubicacion: venta.ubicacionVenta ?? 'almacen',
      usuario: nombreUsuario(venta.usuarioId),
      nota: venta.notas ?? null,
      origen: 'directa'
    }

    if (tipoVenta === 'casa') {
      filas.casa.push({ ...fila, categoria: 'casa' })
    } else if (tipoVenta === 'familiar') {
      filas.familiar.push({ ...fila, categoria: 'familiar' })
    } else if (tipoVenta === 'regalo') {
      filas.regalo.push({
        ...fila,
        precio: 0,
        subtotal: 0,
        ganancia: redondear2(-costo),
        categoria: 'regalo'
      })
    } else {
      filas.directa.push(fila)
    }
  }

  // ---------- Fiado directo (por cobrar) ----------
  const cuentasDirectas = (cuentas ?? []).filter(c => !c.cuadreOrigenId)
  const movsFiado = movsDelLote.filter(
    m =>
      !m.anulado &&
      m.tipo === 'venta' &&
      !m.cuadreId &&
      !m.ventaDirectaId &&
      (m.cuentaFiadoItemId || String(m.motivo ?? '').startsWith('deuda_directa'))
  )

  function resolverCuentaFiado(m) {
    if (m.cuentaFiadoItemId) {
      const item = cuentaItemPorId.get(m.cuentaFiadoItemId)
      const cuenta = item ? cuentaPorId.get(item.cuentaFiadoId) : null
      if (item && cuenta) return { cuenta, item }
    }
    // Compatibilidad con deudas creadas antes de existir el enlace directo:
    // se busca la cuenta directa del mismo producto más cercana en el tiempo.
    const ms = aMs(m.creadoEn) ?? 0
    let mejor = null
    for (const cuenta of cuentasDirectas) {
      const item = (itemsPorCuenta.get(cuenta.id) ?? []).find(
        it => it.productoId === m.productoId
      )
      if (!item) continue
      const delta = Math.abs((aMs(cuenta.creadoEn) ?? 0) - ms)
      if (!mejor || delta < mejor.delta) mejor = { cuenta, item, delta }
    }
    // Diez minutos de margen: la cabecera y el movimiento se escriben en la
    // misma transacción, así que la diferencia real es de milisegundos.
    if (mejor && mejor.delta <= 10 * 60 * 1000) {
      return { cuenta: mejor.cuenta, item: mejor.item }
    }
    return null
  }

  for (const m of movsFiado) {
    const resuelto = resolverCuentaFiado(m)
    if (!resuelto) continue
    const { cuenta, item } = resuelto

    const cantidad = Math.abs(Math.trunc(Number(m.cantidad) || 0))
    const precio = Number(item.precioVentaUsado) || 0
    const costo = Number(m.importe) || 0
    const subtotal = redondear2(cantidad * precio)
    const montoCuenta = Number(cuenta.montoTotal) || 0
    const proporcionPagada = montoCuenta > 0
      ? Math.min(1, (Number(cuenta.montoPagado) || 0) / montoCuenta)
      : 0
    const cobrado = redondear2(subtotal * proporcionPagada)

    filas.fiado.push({
      id: `${cuenta.id}:${m.id}`,
      tipo: 'fiado',
      fechaMs: aMs(cuenta.creadoEn),
      horaMs: aMs(m.creadoEn),
      cantidad,
      precio,
      costoUnitario: Number(m.precioUnitario) || 0,
      costo: redondear2(costo),
      subtotal,
      ganancia: redondear2(subtotal - costo),
      categoria: clasificar(precio, Number(m.precioUnitario) || 0),
      cliente: nombreCliente(cuenta.clienteId),
      ubicacion: Number(m.deltaQuiosco) < 0 ? 'quiosco' : 'almacen',
      usuario: nombreUsuario(m.usuarioId),
      nota: null,
      estado: cuenta.estado ?? 'pendiente',
      cobrado,
      porCobrar: redondear2(subtotal - cobrado),
      origen: 'fiado'
    })
  }

  // ---------- Merma ----------
  for (const m of movsDelLote) {
    if (m.anulado || m.tipo !== 'merma') continue
    const cantidad = Math.abs(Math.trunc(Number(m.cantidad) || 0))
    const costo = Number(m.importe) || 0
    filas.merma.push({
      id: m.id,
      tipo: 'merma',
      fechaMs: aMs(m.creadoEn),
      horaMs: aMs(m.creadoEn),
      cantidad,
      costoUnitario: Number(m.precioUnitario) || 0,
      costo: redondear2(costo),
      subtotal: 0,
      ganancia: redondear2(-costo),
      categoria: 'merma',
      cliente: null,
      ubicacion: Number(m.deltaQuiosco) < 0 ? 'quiosco' : 'almacen',
      usuario: nombreUsuario(m.usuarioId),
      motivo: m.motivo ?? null,
      nota: m.nota ?? null,
      origen: 'merma'
    })
  }

  // ---------- Resumen ----------
  const resumen = {
    quiosco: categoriaVacia(),
    directa: categoriaVacia(),
    casa: categoriaVacia(),
    familiar: categoriaVacia(),
    regalo: categoriaVacia(),
    merma: categoriaVacia(),
    fiado: categoriaVacia()
  }

  const destino = {
    quiosco: 'quiosco',
    directa: 'directa',
    casa: 'casa',
    familiar: 'familiar',
    regalo: 'regalo',
    merma: 'merma',
    fiado: 'fiado'
  }

  for (const [grupo, lista] of Object.entries(filas)) {
    const clave = destino[grupo]
    for (const fila of lista) {
      acumularFila(resumen[clave], fila)
      if (clave === 'fiado') {
        resumen.fiado.cobrado = redondear2((resumen.fiado.cobrado || 0) + (fila.cobrado || 0))
        resumen.fiado.porCobrar = redondear2((resumen.fiado.porCobrar || 0) + (fila.porCobrar || 0))
      }
    }
    redondearCategoria(resumen[clave])
  }

  const ingresoVentas = redondear2(
    resumen.quiosco.ingreso +
    resumen.directa.ingreso +
    resumen.casa.ingreso +
    resumen.familiar.ingreso
  )
  const costoVentas = redondear2(
    resumen.quiosco.costo +
    resumen.directa.costo +
    resumen.casa.costo +
    resumen.familiar.costo
  )
  const gananciaVentas = redondear2(ingresoVentas - costoVentas)
  // El resultado incluye TODO lo que salió del lote: ventas, fiado (aunque no
  // esté cobrado), regalos y mermas. El flujo de caja se muestra aparte.
  const resultado = redondear2(
    gananciaVentas +
    resumen.fiado.ganancia +
    resumen.regalo.ganancia +
    resumen.merma.ganancia
  )

  return {
    lote: {
      id: lote?.id ?? null,
      productoId: lote?.productoId ?? null,
      nombreProducto: lote?.nombreProducto ?? null,
      fechaEntrada: lote?.fechaEntrada ?? null,
      cantidadInicial: Number(lote?.cantidadInicial) || 0,
      precioUnitario: precioCompra,
      valorCompra: redondear2(cantidadEntrada * precioCompra),
      detalleCompra: lote?.detalleCompra ?? null,
      notas: lote?.notas ?? null,
      anulado: Boolean(lote?.anulado),
      proveedor: lote?.proveedorNombre ?? null
    },
    saldos: {
      almacen: saldo.almacen,
      quiosco: saldo.quiosco,
      total: saldo.almacen + saldo.quiosco,
      valorAlmacen: redondear2(saldo.almacen * precioCompra),
      valorQuiosco: redondear2(saldo.quiosco * precioCompra),
      consumido: saldo.consumido
    },
    resumen: {
      unidadesEntrada: cantidadEntrada,
      unidadesEnStock: saldo.almacen + saldo.quiosco,
      unidadesVendidas:
        resumen.quiosco.unidades +
        resumen.directa.unidades +
        resumen.casa.unidades +
        resumen.familiar.unidades,
      ingresoVentas,
      costoVentas,
      gananciaVentas,
      ingresoCobrado: redondear2(ingresoVentas + (resumen.fiado.cobrado ?? 0)),
      porCobrar: resumen.fiado.porCobrar ?? 0,
      perdidaRegalo: redondear2(-resumen.regalo.ganancia),
      perdidaMerma: redondear2(-resumen.merma.ganancia),
      resultado,
      ...resumen
    },
    filas: {
      quiosco: filas.quiosco.sort(porFechaDesc),
      directa: filas.directa.sort(porFechaDesc),
      casa: filas.casa.sort(porFechaDesc),
      familiar: filas.familiar.sort(porFechaDesc),
      regalo: filas.regalo.sort(porFechaDesc),
      merma: filas.merma.sort(porFechaDesc),
      fiado: filas.fiado.sort(porFechaDesc)
    }
  }
}
