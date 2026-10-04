/**
 * shared/inventario/fifo.js — Consumo FIFO puro, sin Vue ni DB.
 *
 * Entrada: lotes ordenados por (fechaEntrada, creadoEn) con su saldo disponible
 * en la ubicación que se descuenta, y líneas de venta en orden de secuencia.
 * Salida: por cada línea, repartos { loteId, cantidad, precioUnitario, importe }.
 *
 * Todo son enteros en cantidad (decisión de negocio). El dinero va en
 * doublePrecision y se redondea a 2 decimales por importe.
 */

function redondear2(n) {
  return Math.round(n * 100) / 100
}

/**
 * @param {Array<{ id, precioUnitario, saldoDisponible }>} lotes
 *   Ordenados por antigüedad (más viejo primero).
 * @param {Array<{ lineaId, productoId, cantidad }>} lineas
 *   En orden de secuencia de venta.
 * @returns {{ repartos: Array, faltantes: Array, costoTotal: number }}
 */
export function consumirFIFO(lotes, lineas) {
  const saldos = new Map(lotes.map(l => [l.id, Math.max(0, Math.trunc(l.saldoDisponible))]))
  const precios = new Map(lotes.map(l => [l.id, Number(l.precioUnitario) || 0]))

  const repartos = []
  const faltantes = []
  let costoTotal = 0

  for (const linea of lineas) {
    let pendiente = Math.trunc(Number(linea.cantidad) || 0)
    if (pendiente <= 0) continue
    for (const lote of lotes) {
      if (pendiente <= 0) break
      const disp = saldos.get(lote.id) ?? 0
      if (disp <= 0) continue
      const toma = Math.min(disp, pendiente)
      const precio = precios.get(lote.id) ?? 0
      const importe = redondear2(toma * precio)
      repartos.push({
        lineaId: linea.lineaId,
        loteId: lote.id,
        cantidad: toma,
        precioUnitario: precio,
        importe
      })
      costoTotal = redondear2(costoTotal + importe)
      saldos.set(lote.id, disp - toma)
      pendiente -= toma
    }
    if (pendiente > 0) {
      faltantes.push({ lineaId: linea.lineaId, productoId: linea.productoId, faltante: pendiente })
    }
  }

  return { repartos, faltantes, costoTotal }
}

/**
 * Saldos derivados del libro de movimientos.
 * @param {Array<{ productoId, loteId, deltaAlmacen, deltaQuiosco, anulado }>} movimientos
 * @returns {Map<string, { almacen: number, quiosco: number, porLote: Map }>}
 */
export function saldosDesdeMovimientos(movimientos) {
  const saldos = new Map()
  for (const m of movimientos) {
    if (m.anulado) continue
    let s = saldos.get(m.productoId)
    if (!s) {
      s = { almacen: 0, quiosco: 0, porLote: new Map() }
      saldos.set(m.productoId, s)
    }
    s.almacen += Math.trunc(Number(m.deltaAlmacen) || 0)
    s.quiosco += Math.trunc(Number(m.deltaQuiosco) || 0)
    if (m.loteId) {
      const sl = s.porLote.get(m.loteId) ?? { almacen: 0, quiosco: 0 }
      sl.almacen += Math.trunc(Number(m.deltaAlmacen) || 0)
      sl.quiosco += Math.trunc(Number(m.deltaQuiosco) || 0)
      s.porLote.set(m.loteId, sl)
    }
  }
  return saldos
}

/**
 * Sugerencia de reposición: faltan = recomendado - quiosco (mínimo 0),
 * a reponer = min(faltan, disponible en almacén).
 */
export function sugerenciaReposicion({ productos, saldos }) {
  const out = []
  for (const p of productos) {
    const s = saldos.get(p.id) ?? { almacen: 0, quiosco: 0 }
    const recomendado = Math.trunc(Number(p.stockRecomendadoQuiosco) || 0)
    if (recomendado <= 0) continue
    const faltan = Math.max(0, recomendado - s.quiosco)
    if (faltan <= 0) continue
    out.push({
      productoId: p.id,
      nombre: p.nombre,
      quiosco: s.quiosco,
      recomendado,
      faltan,
      disponibleAlmacen: s.almacen,
      aReponer: Math.min(faltan, Math.max(0, s.almacen))
    })
  }
  return out.filter(r => r.aReponer > 0)
}
