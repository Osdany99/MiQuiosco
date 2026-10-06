/**
 * shared/inventario/vista.js — Vista de saldos por producto (la que muestra /inventario).
 * Idéntica en servidor y cliente: misma función, mismos números.
 */
import { saldosPorProducto } from './operaciones.js'

function aEpoch(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isNaN(n) ? 0 : n
}

function redondear2(n) {
  return Math.round(Number(n) * 100) / 100
}

export function vistaSaldos({ productos, lotes, movimientos }) {
  const saldos = saldosPorProducto(
    movimientos.map(m => ({
      productoId: m.productoId,
      deltaAlmacen: m.deltaAlmacen,
      deltaQuiosco: m.deltaQuiosco,
      anulado: m.anulado
    }))
  )

  const ordenados = [...lotes]
    .filter(l => !l.anulado)
    .sort((a, b) => {
      const fa = String(a.fechaEntrada ?? '')
      const fb = String(b.fechaEntrada ?? '')
      if (fa !== fb) return fa < fb ? 1 : -1
      return aEpoch(a.creadoEn) - aEpoch(b.creadoEn)
    })
  const costoActual = new Map()
  for (const l of ordenados) {
    costoActual.set(l.productoId, Number(l.precioUnitario) || 0)
  }

  return productos
    .filter(p => p.activo)
    .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
    .map(p => ({
      productoId: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      unidad: p.unidad ?? null,
      seVende: p.activoQuiosco !== false,
      almacen: saldos.get(p.id)?.almacen ?? 0,
      quiosco: saldos.get(p.id)?.quiosco ?? 0,
      stockMinimoQuiosco: Number(p.stockMinimoQuiosco ?? 0),
      stockRecomendadoQuiosco: Number(p.stockRecomendadoQuiosco ?? 0),
      stockMinimoAlmacen: Number(p.stockMinimoAlmacen ?? 0),
      costoActual: costoActual.has(p.id)
        ? costoActual.get(p.id)
        : Number(p.precioCompraActual ?? 0) || 0,
      valorizadoQuiosco: 0,
      valorizadoAlmacen: 0,
      precioVentaActual: Number(p.precioVentaActual ?? 0)
    }))
    .map((r) => {
      r.valorizadoQuiosco = redondear2(r.quiosco * r.costoActual)
      r.valorizadoAlmacen = redondear2(r.almacen * r.costoActual)
      return r
    })
}
