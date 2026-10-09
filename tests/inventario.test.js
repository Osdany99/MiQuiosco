// Tests de inventario por lotes. Reproducen el escenario real del negocio:
// 100 panes a 10, más tarde el mismo producto a 12, ventas en medio y
// reaperturas. Es la garantía de que cambiar precios NO altera las ganancias
// ya cerradas y de que la_identity del lote se conserva en el traspaso.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirEntrada,
  construirTraspaso,
  construirVentaCuadre,
  construirVentaDirecta,
  construirAnulacionCuadre,
  construirAjuste,
  saldosPorProducto,
  lotesConSaldo,
  rotarPrecioCompra,
  calcularRotacionHistorial
} from '../shared/inventario/operaciones.js'
import { entradaAlmacenSchema } from '../shared/schemas/entradaAlmacen.js'
import { traspasoSchema, ajusteInventarioSchema } from '../shared/schemas/traspaso.js'
import { productoSchema } from '../shared/schemas/producto.js'
import { ventaDirectaSchema, deudaDirectaSchema, pagoFiadoDirectoSchema } from '../shared/schemas/directas.js'
import { pagoFiadoSchema } from '../shared/schemas/pagoFiado.js'
import { vistaSaldos } from '../shared/inventario/vista.js'
import { saldosDesdeMovimientos } from '../shared/inventario/fifo.js'
import {
  aDia, diasEntre, enRango, indiceFechasNegocio,
  resumenVentas, magnitudesPorTipo, magnitudesPorProducto,
  ventanaCobertura, diasCobertura, antiguedadLotes, antiguedadMediaPonderada,
  totalesValorInventario, estadoDeFila, conteoEstadoStock
} from '../shared/inventario/analitica.js'

const PUESTO = '11111111-1111-4111-8111-111111111111'
const JEFE = '22222222-2222-4222-8222-222222222222'
const PAN = '33333333-3333-4333-8333-333333333333'
const meta = { puestoId: PUESTO, usuarioId: JEFE, ahora: 1735689600000 }

function entrada(cantidad, precio, fecha = '2026-01-01', ahora = meta.ahora) {
  return construirEntrada(
    { fechaEntrada: fecha, lineas: [{ productoId: PAN, cantidad, precioUnitario: precio }] },
    { ...meta, ahora }
  )
}

/** Saldos por producto a partir de una lista de movimientos. */
function saldosDe(movs) {
  return saldosPorProducto(movs.map(m => ({
    productoId: m.productoId,
    deltaAlmacen: m.deltaAlmacen,
    deltaQuiosco: m.deltaQuiosco,
    anulado: m.anulado
  })))
}

/** Lotes con saldo en una ubicación, leyendo del "libro" acumulado. */
function lotesEn(movs, ubicacion) {
  const filas = [...new Map(movs.map(m => [m.loteId, {
    id: m.loteId,
    productoId: m.productoId,
    precioUnitario: m.precioUnitario,
    fechaEntrada: m.fechaEntrada,
    creadoEn: m.creadoEn
  }])).values()]
  return lotesConSaldo(filas, movs, PAN, ubicacion)
}

describe('entrada al almacén', () => {
  it('crea un lote y un movimiento de entrada por línea', () => {
    const { lotes, movimientos } = entrada(100, 10)
    assert.equal(lotes.length, 1)
    assert.equal(movimientos.length, 1)
    assert.equal(lotes[0].cantidadInicial, 100)
    assert.equal(lotes[0].precioUnitario, 10)
    assert.equal(movimientos[0].deltaAlmacen, 100)
    assert.equal(movimientos[0].deltaQuiosco, 0)
    assert.equal(movimientos[0].importe, 1000)
  })

  it('agrupa las líneas de una misma compra con entradaRef', () => {
    const { entradaRef, lotes, movimientos } = construirEntrada(
      { fechaEntrada: '2026-01-01', lineas: [
        { productoId: PAN, cantidad: 10, precioUnitario: 5 },
        { productoId: PAN, cantidad: 20, precioUnitario: 7 }
      ] },
      meta
    )
    assert.equal(lotes.length, 2)
    assert.ok(lotes[0].entradaRef === entradaRef && lotes[1].entradaRef === entradaRef)
    assert.equal(movimientos.length, 2)
  })

  it('el esquema rechaza cantidad 0 y precio negativo', () => {
    const base = { fechaEntrada: '2026-01-01', lineas: [{ productoId: PAN, cantidad: 1, precioUnitario: 1 }] }
    assert.equal(entradaAlmacenSchema.safeParse(base).success, true)
    assert.equal(entradaAlmacenSchema.safeParse({ ...base, lineas: [{ ...base.lineas[0], cantidad: 0 }] }).success, false)
    assert.equal(entradaAlmacenSchema.safeParse({ ...base, lineas: [{ ...base.lineas[0], precioUnitario: -1 }] }).success, false)
    assert.equal(entradaAlmacenSchema.safeParse({ ...base, lineas: [] }).success, false)
  })
})

describe('traspaso almacén → quiosco', () => {
  it('conserva la identidad y el precio del lote', () => {
    const e = entrada(100, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 40 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    assert.equal(tr.faltantes.length, 0)
    assert.equal(tr.movimientos.length, 1)
    assert.equal(tr.movimientos[0].deltaAlmacen, -40)
    assert.equal(tr.movimientos[0].deltaQuiosco, 40)
    // El costo viaja con el lote: no se revalúa al precio de hoy.
    assert.equal(tr.movimientos[0].precioUnitario, 10)
    assert.equal(tr.movimientos[0].loteId, e.lotes[0].id)
  })

  it('rechaza traspasar más de lo disponible en almacén', () => {
    const e = entrada(30, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 50 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    assert.equal(tr.movimientos.length, 0)
    assert.equal(tr.faltantes[0].disponible, 30)
  })

  it('el esquema exige al menos una línea con cantidad >= 1', () => {
    assert.equal(traspasoSchema.safeParse({ fecha: '2026-01-01', lineas: [{ productoId: PAN, cantidad: 1 }] }).success, true)
    assert.equal(traspasoSchema.safeParse({ fecha: '2026-01-01', lineas: [] }).success, false)
    assert.equal(traspasoSchema.safeParse({ fecha: '2026-01-01', lineas: [{ productoId: PAN, cantidad: 0 }] }).success, false)
  })
})

describe('venta FIFO (el caso del pan)', () => {
  it('30 unidades salen del lote a 10 → costo 300', () => {
    const e = entrada(100, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const v = construirVentaCuadre({
      lineas: [{ id: 'linea-1', productoId: PAN, cantidad: 30 }],
      lotesPorProducto: new Map([[PAN, lotesEn(libro, 'quiosco')]]),
      cuadreId: 'c1',
      meta
    })
    assert.equal(v.costoTotal, 300)
    assert.equal(v.movimientos[0].precioUnitario, 10)
    assert.equal(v.faltantes.length, 0)
  })

  it('tras reprecio, agota el lote viejo y pasa al nuevo', () => {
    const e1 = entrada(100, 10, '2026-01-01', meta.ahora)
    const tr1 = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e1.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    // Días después se compra más caro y se repone al quiosco.
    const e2 = entrada(100, 12, '2026-01-11', meta.ahora + 1000)
    const tr2 = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn([...e1.movimientos, ...tr1.movimientos, ...e2.movimientos], 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-11' }
    })
    const libro = [...e1.movimientos, ...tr1.movimientos, ...e2.movimientos, ...tr2.movimientos]
    const quiosco = lotesEn(libro, 'quiosco')
    assert.equal(quiosco.reduce((s, l) => s + l.saldo, 0), 200)

    // 130 vendidas: 100 del lote a 10 y 30 del lote a 12.
    const v = construirVentaCuadre({
      lineas: [{ id: 'linea-2', productoId: PAN, cantidad: 130 }],
      lotesPorProducto: new Map([[PAN, quiosco]]),
      cuadreId: 'c2',
      meta
    })
    assert.equal(v.costoTotal, 1360) // 100*10 + 30*12
    assert.equal(v.movimientos.length, 2)
    assert.equal(v.movimientos[0].loteId, e1.lotes[0].id, 'primero el más antiguo')
    assert.equal(v.movimientos[1].loteId, e2.lotes[0].id)
  })

  it('la ganancia no depende del precio de compra actual del producto', () => {
    // El costo viene del lote, no de productos.precioCompraActual. Aunque ese
    // campo valga 99 al día siguiente, el costo de la venta no se mueve.
    const e = entrada(100, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const v = construirVentaCuadre({
      lineas: [{ id: 'l', productoId: PAN, cantidad: 90 }],
      lotesPorProducto: new Map([[PAN, lotesEn(libro, 'quiosco')]]),
      cuadreId: 'c',
      meta
    })
    assert.equal(v.costoTotal, 900) // 90*10, fijo
  })

  it('reporta faltante sin bloquear: se descuenta hasta donde alcanza', () => {
    const e = entrada(20, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 20 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const v = construirVentaCuadre({
      lineas: [{ id: 'l', productoId: PAN, cantidad: 25 }],
      lotesPorProducto: new Map([[PAN, lotesEn(libro, 'quiosco')]]),
      cuadreId: 'c',
      meta
    })
    assert.equal(v.costoTotal, 200) // 20*10
    assert.equal(v.movimientos.length, 1)
    assert.equal(v.faltantes[0].faltante, 5)
  })

  it('respeta el orden de secuencia de las líneas', () => {
    // Dos líneas del mismo día con distinto precio de venta: la primera
    // (secuencia menor) consume primero el lote más antiguo.
    const e = entrada(100, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const v = construirVentaCuadre({
      lineas: [
        { id: 'linea-tarde', productoId: PAN, cantidad: 10 },
        { id: 'linea-manana', productoId: PAN, cantidad: 10 }
      ],
      lotesPorProducto: new Map([[PAN, lotesEn(libro, 'quiosco')]]),
      cuadreId: 'c',
      meta
    })
    const porLinea = Object.fromEntries(v.movimientos.map(m => [m.lineaCuadreId, m.loteId]))
    assert.equal(porLinea['linea-tarde'], e.lotes[0].id)
    assert.equal(porLinea['linea-manana'], e.lotes[0].id)
  })
})

describe('reapertura (anulación por contramovimiento)', () => {
  it('devuelve las unidades y no rompe el saldo', () => {
    const e = entrada(100, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 100 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const v = construirVentaCuadre({
      lineas: [{ id: 'l', productoId: PAN, cantidad: 30 }],
      lotesPorProducto: new Map([[PAN, lotesEn(libro, 'quiosco')]]),
      cuadreId: 'c',
      meta
    })
    const conVenta = [...libro, ...v.movimientos]
    const { anulaciones } = construirAnulacionCuadre({
      movimientosPrevios: v.movimientos,
      meta
    })
    assert.equal(anulaciones.length, 1)
    assert.equal(anulaciones[0].tipo, 'anulacion')
    assert.equal(anulaciones[0].deltaQuiosco, 30) // devuelve al quiosco
    assert.equal(anulaciones[0].deltaAlmacen, 0)

    // El libro completo (venta + anulación) deja el quiosco como estaba.
    const saldoFinal = saldosDe([...conVenta, ...anulaciones]).get(PAN).quiosco
    assert.equal(saldoFinal, 100)
  })

  it('no toca movimientos que no son venta ni ya anulados', () => {
    const e = entrada(10, 10)
    const { anulaciones } = construirAnulacionCuadre({
      movimientosPrevios: [
        ...e.movimientos, // entrada: se ignora
        { ...e.movimientos[0], id: 'x', tipo: 'venta', anulado: true } // ya anulado: se ignora
      ],
      meta
    })
    assert.equal(anulaciones.length, 0)
  })
})

describe('merma y devolución', () => {
  it('la merma en quiosco descuenta del quiosco', () => {
    const e = entrada(50, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 50 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const { movimientos, faltante } = construirAjuste({
      productoId: PAN,
      tipo: 'merma',
      ubicacion: 'quiosco',
      cantidad: 5,
      motivo: 'se rompió',
      lotesOrdenados: lotesEn(libro, 'quiosco'),
      meta
    })
    assert.equal(faltante, null)
    assert.equal(movimientos[0].deltaQuiosco, -5)
    assert.equal(movimientos[0].deltaAlmacen, 0)
    assert.equal(movimientos[0].importe, 50)
    assert.equal(saldosDe([...libro, ...movimientos]).get(PAN).quiosco, 45)
  })

  it('la devolución devuelve unidades del quiosco al almacén', () => {
    const e = entrada(50, 10)
    const tr = construirTraspaso({
      lineas: [{ productoId: PAN, cantidad: 50 }],
      lotesPorProducto: new Map([[PAN, lotesEn(e.movimientos, 'almacen')]]),
      meta: { ...meta, fecha: '2026-01-02' }
    })
    const libro = [...e.movimientos, ...tr.movimientos]
    const { movimientos } = construirAjuste({
      productoId: PAN,
      tipo: 'devolucion',
      ubicacion: 'quiosco',
      cantidad: 3,
      motivo: 'no le gustó',
      lotesOrdenados: lotesEn(libro, 'quiosco'),
      meta
    })
    assert.equal(movimientos[0].deltaQuiosco, -3)
    assert.equal(movimientos[0].deltaAlmacen, 3)
  })

  it('el esquema exige motivo en todo ajuste', () => {
    const base = { productoId: PAN, tipo: 'merma', ubicacion: 'quiosco', cantidad: 1 }
    assert.equal(ajusteInventarioSchema.safeParse({ ...base, motivo: 'roto' }).success, true)
    assert.equal(ajusteInventarioSchema.safeParse(base).success, false)
    assert.equal(ajusteInventarioSchema.safeParse({ ...base, motivo: '' }).success, false)
  })
})

describe('saldosPorProducto', () => {
  it('ignora los movimientos anulados', () => {
    const s = saldosPorProducto([
      { productoId: PAN, deltaAlmacen: 100, deltaQuiosco: 0, anulado: false },
      { productoId: PAN, deltaAlmacen: 0, deltaQuiosco: -30, anulado: false },
      { productoId: PAN, deltaAlmacen: 0, deltaQuiosco: -30, anulado: true }
    ])
    assert.equal(s.get(PAN).almacen, 100)
    assert.equal(s.get(PAN).quiosco, -30) // el anulado no cuenta
  })

  it('producto sin movimientos no aparece', () => {
    const s = saldosPorProducto([])
    assert.equal(s.has(PAN), false)
  })
})

// Un producto desactivado solo del quiosco sigue en almacén y conserva su
// stock: por eso la vista no lo esconde, lo marca como "No se vende".
describe('producto por ubicación (activo / activoQuiosco)', () => {
  const base = { id: PAN, nombre: 'Pan', activo: true, orden: 1, precioCompraActual: 10, precioVentaActual: 18 }

  it('productoSchema: activoQuiosco es true por defecto', () => {
    const r = productoSchema.parse({ nombre: 'Pan' })
    assert.equal(r.activoQuiosco, true)
    assert.equal(r.activo, true)
  })

  it('productoSchema: acepta desactivar solo el quiosco', () => {
    const r = productoSchema.parse({ nombre: 'Pan', activo: true, activoQuiosco: false })
    assert.equal(r.activo, true)
    assert.equal(r.activoQuiosco, false)
  })

  it('vistaSaldos: seVende refleja el flag y ambos saldos siguen visibles', () => {
    const vista = vistaSaldos({
      productos: [{ ...base }, { ...base, id: 'OTRO', nombre: 'Refresco', activoQuiosco: false }],
      lotes: [],
      movimientos: [
        { productoId: PAN, deltaAlmacen: 100, deltaQuiosco: 10, anulado: false },
        { productoId: 'OTRO', deltaAlmacen: 50, deltaQuiosco: 0, anulado: false }
      ]
    })
    const pan = vista.find(v => v.productoId === PAN)
    const otro = vista.find(v => v.productoId === 'OTRO')

    assert.equal(pan.seVende, true)
    // Desactivado del quiosco: sigue listado, con su stock de almacén intacto.
    assert.equal(otro.seVende, false)
    assert.equal(otro.almacen, 50)
    assert.equal(vista.length, 2)
  })

  it('vistaSaldos: un producto inactivo (maestro) desaparece de ambas vistas', () => {
    const vista = vistaSaldos({
      productos: [{ ...base, activo: false }],
      lotes: [],
      movimientos: [{ productoId: PAN, deltaAlmacen: 100, deltaQuiosco: 0, anulado: false }]
    })
    assert.equal(vista.length, 0)
  })
})

// Ventas y deudas directas: operaciones del jefe fuera del cuadre. La regla que
// las distingue es que no tocan ninguna gaveta, pero sí descuentan inventario
// por FIFO y congelan su ganancia al momento.
describe('operaciones fuera de cuadre', () => {
  // Libro con 100 panes a 10: 60 en almacén y 40 ya traspasados al quiosco.
  const ENTRADA = entrada(100, 10)
  const TRASPASO = construirTraspaso({
    lineas: [{ productoId: PAN, cantidad: 40 }],
    lotesPorProducto: new Map([[PAN, lotesEn(ENTRADA.movimientos, 'almacen')]]),
    meta: { ...meta, fecha: '2026-01-02' }
  })
  const LIBRO = [...ENTRADA.movimientos, ...TRASPASO.movimientos]

  function directa(lineas, ubicacion = 'almacen', ventaId = null) {
    const ids = [...new Set(lineas.map(l => l.productoId))]
    const lotesPorProducto = new Map(ids.map(id => [id, lotesEn(LIBRO, ubicacion)]))
    return construirVentaDirecta({
      lineas,
      lotesPorProducto,
      ubicacion,
      ventaId,
      motivo: 'venta_directa_almacen',
      meta
    })
  }

  it('descuenta del almacén y congera la ganancia', () => {
    const r = directa([{ productoId: PAN, cantidad: 10, precioVentaUsado: 18 }])
    assert.equal(r.movimientos.length, 1)
    assert.equal(r.movimientos[0].deltaAlmacen, -10)
    assert.equal(r.movimientos[0].deltaQuiosco, 0)
    assert.equal(r.montoTotal, 180)
    assert.equal(r.costoTotal, 100)
    assert.equal(r.ganancia, 80)
  })

  it('nunca toca un cuadre: ni cuadreId ni lineaCuadreId', () => {
    const r = directa([{ productoId: PAN, cantidad: 1, precioVentaUsado: 18 }])
    assert.equal(r.movimientos[0].cuadreId, null)
    assert.equal(r.movimientos[0].lineaCuadreId, null)
  })

  it('descuenta del quiosco cuando el jefe lo elige', () => {
    const r = directa([{ productoId: PAN, cantidad: 3, precioVentaUsado: 18 }], 'quiosco')
    assert.equal(r.movimientos.length, 1)
    assert.equal(r.movimientos[0].deltaQuiosco, -3)
    assert.equal(r.movimientos[0].deltaAlmacen, 0)
    // El costo del quiosco sigue siendo el del lote, no un precio de hoy.
    assert.equal(r.costoTotal, 30)
  })

  it('consume varios lotes por FIFO y reparte el costo por línea', () => {
    const libro = [...entrada(5, 10).movimientos, ...entrada(5, 20, '2026-02-01').movimientos]
    const ids = [PAN]
    const r = construirVentaDirecta({
      lineas: [{ productoId: PAN, cantidad: 8, precioVentaUsado: 30 }],
      lotesPorProducto: new Map(ids.map(id => [id, lotesConSaldo(
        [...new Map(libro.map(m => [m.loteId, {
          id: m.loteId,
          productoId: PAN,
          precioUnitario: m.precioUnitario,
          fechaEntrada: m.fechaEntrada,
          creadoEn: m.creadoEn
        }])).values()],
        libro,
        PAN,
        'almacen'
      )])),
      ubicacion: 'almacen',
      meta
    })
    assert.equal(r.movimientos.length, 2)
    assert.equal(r.movimientos[0].precioUnitario, 10)
    assert.equal(r.movimientos[1].precioUnitario, 20)
    assert.equal(r.costoTotal, 110) // 5x10 + 3x20
    assert.equal(r.items[0].costoUnitario, 13.75) // 110 / 8
    assert.equal(r.ganancia, 130) // 8x30 - 110
  })

  it('reporta faltantes sin inventar stock', () => {
    // Quedan 60 en almacén (100 - 40 traspasados): pedir 200 deja 140 sin servir.
    const r = directa([{ productoId: PAN, cantidad: 200, precioVentaUsado: 18 }])
    assert.equal(r.movimientos.length, 1)
    assert.equal(r.movimientos[0].cantidad, 60)
    assert.equal(r.faltantes.length, 1)
    assert.equal(r.faltantes[0].faltante, 140)
  })

  it('enlaza los movimientos a la venta directa solo si hay id', () => {
    const conId = directa([{ productoId: PAN, cantidad: 1, precioVentaUsado: 18 }], 'almacen', 'venta-1')
    assert.equal(conId.movimientos[0].ventaDirectaId, 'venta-1')
    // Una deuda directa no tiene fila en ventas_directas: la referencia va null.
    const sinId = directa([{ productoId: PAN, cantidad: 1, precioVentaUsado: 18 }])
    assert.equal(sinId.movimientos[0].ventaDirectaId, null)
  })

  it('ordena las líneas por secuencia antes de consumir lotes', () => {
    const r = directa([
      { productoId: PAN, cantidad: 1, precioVentaUsado: 5, secuencia: 1 },
      { productoId: PAN, cantidad: 1, precioVentaUsado: 5, secuencia: 0 }
    ])
    assert.deepEqual(r.items.map(i => i.secuencia), [0, 1])
  })

  it('ignora las líneas de cantidad 0', () => {
    const r = directa([{ productoId: PAN, cantidad: 0, precioVentaUsado: 18 }])
    assert.equal(r.items.length, 0)
    assert.equal(r.movimientos.length, 0)
    assert.equal(r.ganancia, 0)
  })

  it('el esquema de venta directa exige al menos una línea y una ubicación válida', () => {
    assert.equal(ventaDirectaSchema.safeParse({ lineas: [] }).success, false)
    assert.equal(ventaDirectaSchema.safeParse({
      ubicacion: 'bodega',
      lineas: [{ productoId: PAN, cantidad: 1, precioVentaUsado: 5 }]
    }).success, false)
    // Por defecto sale del almacén: es lo habitual.
    const ok = ventaDirectaSchema.parse({
      lineas: [{ productoId: PAN, cantidad: 1, precioVentaUsado: 5 }]
    })
    assert.equal(ok.ubicacion, 'almacen')
  })

  it('el esquema de deuda directa valida cliente y forma de pago', () => {
    const base = { lineas: [{ productoId: PAN, cantidad: 1, precioVentaUsado: 5 }] }
    assert.equal(deudaDirectaSchema.safeParse(base).success, false)
    const ok = deudaDirectaSchema.parse({ ...base, clienteId: JEFE, formaPagoInicial: 'transferencia' })
    assert.equal(ok.ubicacion, 'almacen')
    assert.equal(ok.montoPagadoInicial, 0)
    assert.equal(ok.formaPagoInicial, 'transferencia')
  })

  // El cobro directo es la razón de que cuadreId sea nullable en pagos_fiado.
  it('el esquema de pago admite cuadreId null (cobro directo)', () => {
    assert.equal(pagoFiadoSchema.safeParse({
      cuentaFiadoId: PAN,
      cuadreId: null,
      monto: 50,
      formaPago: 'efectivo'
    }).success, true)
    assert.equal(pagoFiadoDirectoSchema.safeParse({
      cuentaFiadoId: PAN,
      monto: 50,
      formaPago: 'efectivo'
    }).success, true)
    // Un id de cuadre inválido sigue siendo inválido, no se "compra" con null.
    assert.equal(pagoFiadoSchema.safeParse({
      cuentaFiadoId: PAN,
      cuadreId: 'no-es-uuid',
      monto: 50,
      formaPago: 'efectivo'
    }).success, false)
  })
})

// ─── Analítica sobre el libro (shared/inventario/analitica.js) ─────────────
// Lo que consumen las gráficas nuevas. Se prueban las TRES reglas que hacen
// que los números sean ciertos: se suma en neto (nunca se cuentan ventas), la
// fecha es la del cuadre (nunca el reloj del dispositivo) y el costo es el del
// lote (nunca el precio de compra de hoy).

/** Epoch ms de una fecha, como los que entregan los repos (epoch, no ISO). */
function ms(dia, hora = 17) {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d, hora, 0, 0).getTime()
}

const CUADRE_1 = 'cuadre-1'
const CUADRE_2 = 'cuadre-2'
const LECHE = '44444444-4444-4444-8444-444444444444'

/** 100 panes a 10 el 01-01 y 300 a 20 el 02-01, ambos al almacén. */
const E1 = entrada(100, 10, '2026-01-01', ms('2026-01-01'))
const E2 = entrada(300, 20, '2026-02-01', ms('2026-02-01'))
const LOTES_MOV = [...E1.movimientos, ...E2.movimientos]
const LOTES_FILAS = [...E1.lotes, ...E2.lotes]

/**
 * Se traspasan 120 al quiosco el 01-01 (FIFO: las 100 del lote viejo y 20 del
 * nuevo) y se venden 10 el 05-01 y 95 el 10-03. La segunda venta AGOTA el lote
 * viejo y cruza al nuevo: 90 x 10 y 5 x 20.
 */
const TRASPASO_LIBRO = construirTraspaso({
  lineas: [{ productoId: PAN, cantidad: 120 }],
  lotesPorProducto: new Map([[PAN, lotesConSaldo(LOTES_FILAS, LOTES_MOV, PAN, 'almacen')]]),
  meta: { ...meta, fecha: '2026-01-01', ahora: ms('2026-01-01') }
})
const CON_TRASPASO = [...LOTES_MOV, ...TRASPASO_LIBRO.movimientos]

/**
 * El movimiento se registra un día DESPUÉS del día del cuadre: es lo que pasa
 * cuando el cuadre se reabre y se vuelve a cerrar. Por eso el precio del reloj
 * no puede ser el eje de ninguna gráfica.
 *
 * `libro` es el estado del quiosco ANTES de esta venta: cada venta descuenta
 * del saldo de la anterior, así que la segunda necesita la primera dentro.
 */
function venta(cuadreId, lineaId, cantidad, registro, libro = CON_TRASPASO) {
  return construirVentaCuadre({
    lineas: [{ id: lineaId, productoId: PAN, cantidad }],
    lotesPorProducto: new Map([[PAN, lotesConSaldo(
      LOTES_FILAS, libro, PAN, 'quiosco'
    )]]),
    cuadreId,
    meta: { ...meta, ahora: ms(registro) }
  })
}

const VENTA1 = venta(CUADRE_1, 'linea-1', 10, '2026-01-06')
const VENTA2 = venta(CUADRE_2, 'linea-2', 95, '2026-03-10', [...CON_TRASPASO, ...VENTA1.movimientos])
const LIBRO = [...CON_TRASPASO, ...VENTA1.movimientos, ...VENTA2.movimientos]

const CUADRES = [
  { id: CUADRE_1, fecha: '2026-01-05', puestoId: PUESTO },
  { id: CUADRE_2, fecha: '2026-03-10', puestoId: PUESTO }
]

describe('analitica: fechas', () => {
  it('aDia normaliza epoch, ISO, Date y el propio YYYY-MM-DD', () => {
    assert.equal(aDia(ms('2026-01-05')), '2026-01-05')
    assert.equal(aDia('2026-01-05T23:59:59.000Z'), '2026-01-05')
    assert.equal(aDia('2026-01-05'), '2026-01-05')
    assert.equal(aDia(new Date(2026, 0, 5)), '2026-01-05')
    assert.equal(aDia(null), '')
    assert.equal(aDia('no-es-fecha'), '')
  })

  it('diasEntre cuenta días, no milisegundos', () => {
    assert.equal(diasEntre('2026-01-01', '2026-01-31'), 30)
    assert.equal(diasEntre('2026-02-01', '2026-03-01'), 28)
    assert.equal(diasEntre('2026-01-05', '2026-01-05'), 0)
    assert.equal(diasEntre('', '2026-01-05'), 0)
  })

  it('enRango incluye ambos extremos y trata el rango vacío como todo', () => {
    assert.equal(enRango('2026-01-05', '2026-01-01', '2026-01-31'), true)
    assert.equal(enRango('2026-01-01', '2026-01-01', '2026-01-31'), true)
    assert.equal(enRango('2026-01-31', '2026-01-01', '2026-01-31'), true)
    assert.equal(enRango('2025-12-31', '2026-01-01', '2026-01-31'), false)
    assert.equal(enRango('2026-02-05', '', '2026-01-31'), false)
    assert.equal(enRango('2026-05-05', '', ''), true)
  })
})

describe('analitica: fecha de negocio', () => {
  const fechas = indiceFechasNegocio({
    movimientos: LIBRO,
    cuadres: CUADRES,
    lotes: LOTES_FILAS,
    traspasos: [TRASPASO_LIBRO.traspaso]
  })

  it('la venta toma la fecha de su cuadre, no su creadoEn', () => {
    const mov = VENTA1.movimientos[0]
    assert.equal(mov.cuadreId, CUADRE_1)
    assert.notEqual(fechas.get(mov.id), aDia(mov.creadoEn))
    assert.equal(fechas.get(mov.id), '2026-01-05')
  })

  it('la entrada toma la fecha del lote (la compra, no el registro)', () => {
    assert.equal(fechas.get(E1.movimientos[0].id), '2026-01-01')
    assert.equal(fechas.get(E2.movimientos[0].id), '2026-02-01')
  })

  it('el traspaso toma la fecha del traspaso', () => {
    assert.equal(fechas.get(TRASPASO_LIBRO.movimientos[0].id), '2026-01-01')
  })

  it('sin cabecera cae al día del creadoEn, en vez de dejar el movimiento fuera', () => {
    const suelta = indiceFechasNegocio({
      movimientos: [{ id: 'x', productoId: PAN, tipo: 'merma', deltaAlmacen: -1, deltaQuiosco: 0, creadoEn: ms('2026-04-02') }]
    })
    assert.equal(suelta.get('x'), '2026-04-02')
  })
})

describe('analitica: ventas netas', () => {
  const fechas = indiceFechasNegocio({ movimientos: LIBRO, cuadres: CUADRES })
  const resumen = resumenVentas(LIBRO, fechas)

  it('las unidades vendidas son las netas, no el conteo de filas', () => {
    // 10 + 95 = 105: la segunda venta consume 90 del lote viejo y 5 del nuevo.
    assert.equal(resumen.get(PAN).unidades, 105)
    assert.equal(resumen.get(PAN).dias.size, 2)
  })

  it('el costo es el FIFO real del lote, no el precio de compra de hoy', () => {
    // 10x10 + 90x10 + 5x20 = 1100. Con el precio de hoy (20) saldría 2100.
    assert.equal(resumen.get(PAN).costo, 1100)
  })

  it('las unidades quedan separadas por día de negocio', () => {
    const dias = resumen.get(PAN).dias
    assert.equal(dias.get('2026-01-05'), 10)
    assert.equal(dias.get('2026-03-10'), 95)
    assert.equal(dias.size, 2)
  })

  it('reabrir y volver a cerrar deja la venta como estaba, en su día de cuadre', () => {
    const { anulaciones } = construirAnulacionCuadre({
      movimientosPrevios: VENTA1.movimientos,
      meta: { ...meta, ahora: ms('2026-01-06') }
    })
    assert.equal(anulaciones.length, 1)
    assert.equal(anulaciones[0].tipo, 'anulacion')
    assert.equal(anulaciones[0].deltaQuiosco, 10)
    // El anulado NO se marca: sigue contabilizando, y es su contramovimiento
    // la que lo cancela.
    assert.equal(anulaciones[0].anulado, false)

    // Tras reabrir y volver a cerrar el cuadre, el libro tiene venta original
    // + anulación + venta nueva. Las tres caen en el día del CUADRE, no en el
    // día en que se escribieron, y su neto es una sola venta.
    const conCierre = [...LIBRO, ...anulaciones, ...VENTA1.movimientos]
    const r = resumenVentas(conCierre, indiceFechasNegocio({ movimientos: conCierre, cuadres: CUADRES }))
    assert.equal(r.get(PAN).unidades, 105)
    assert.equal(r.get(PAN).costo, 1100)
    assert.equal(r.get(PAN).dias.get('2026-01-05'), 10)
  })

  it('ignora las filas anuladas y las que no mueven stock', () => {
    const sucias = [
      ...LIBRO,
      { id: 'anulada', productoId: PAN, tipo: 'venta', cantidad: 999, deltaQuiosco: -999, importe: 9999, anulado: true },
      { id: 'nula', productoId: PAN, tipo: 'venta', cantidad: 5, deltaQuiosco: 0, importe: 50, anulado: false }
    ]
    const r = resumenVentas(sucias, fechas)
    assert.equal(r.get(PAN).unidades, 105)
    assert.equal(r.get(PAN).costo, 1100)
  })
})

describe('analitica: magnitudes por tipo', () => {
  const mermas = construirAjuste({
    productoId: PAN,
    tipo: 'merma',
    ubicacion: 'almacen',
    cantidad: 4,
    motivo: 'se rompió',
    lotesOrdenados: lotesConSaldo(LOTES_FILAS, LOTES_MOV, PAN, 'almacen'),
    meta: { ...meta, ahora: ms('2026-01-20') }
  })
  const conMerma = [...LIBRO, ...mermas.movimientos]
  const fechas = indiceFechasNegocio({ movimientos: conMerma, cuadres: CUADRES, lotes: LOTES_FILAS })

  it('la merma se acumula en positivo aunque el delta sea negativo', () => {
    assert.ok(mermas.movimientos[0].deltaAlmacen < 0)
    const porTipo = magnitudesPorTipo(conMerma, fechas, ['entrada', 'merma', 'traspaso'])
    const merma = porTipo.get('merma').get('2026-01-20')
    assert.equal(merma.unidades, 4)
    assert.equal(merma.valor, 40) // 4 x 10, en magnitud
  })

  it('las entradas y los traspasos también salen en magnitud', () => {
    const porTipo = magnitudesPorTipo(conMerma, fechas, ['entrada', 'merma', 'traspaso'])
    assert.equal(porTipo.get('entrada').get('2026-01-01').unidades, 100)
    assert.equal(porTipo.get('entrada').get('2026-02-01').valor, 6000) // 300 x 20
    // El traspaso mueve 120 conservando la identidad de cada lote (100 + 20).
    assert.equal(porTipo.get('traspaso').get('2026-01-01').unidades, 120)
  })

  it('magnitudesPorProducto reparte la merma por producto y día', () => {
    const porProducto = magnitudesPorProducto(conMerma, fechas, ['merma'])
    assert.equal(porProducto.get(PAN).get('2026-01-20').valor, 40)
  })
})

describe('analitica: días de cobertura', () => {
  const fechas = indiceFechasNegocio({ movimientos: LIBRO, cuadres: CUADRES })
  const resumen = resumenVentas(LIBRO, fechas)
  // El quiosco conserva 15 del lote viejo y el almacén 275 del nuevo: 290.
  const saldos = new Map([[PAN, { almacen: 275, quiosco: 15 }]])

  it('amplía la ventana cuando el rango es más corto que minDias y lo avisa', () => {
    // El rango del filtro arranca en hoy: con un solo día el promedio no dice nada.
    const v = ventanaCobertura({ desde: '2026-03-10', hasta: '2026-03-10', hoy: '2026-03-10' })
    assert.equal(v.ampliada, true)
    assert.equal(v.dias, 7)
    assert.equal(v.hasta, '2026-03-10')
    assert.equal(v.desde, '2026-03-04')
  })

  it('respeta una ventana ya suficiente sin ampliarla', () => {
    const v = ventanaCobertura({ desde: '2026-03-01', hasta: '2026-03-10', hoy: '2026-03-10', minDias: 7 })
    assert.equal(v.ampliada, false)
    assert.equal(v.dias, 10)
    assert.equal(v.desde, '2026-03-01')
  })

  it('divide por los días CON venta, no por los días del rango', () => {
    // 105 unidades en 2 días con venta: 52.5 por día, no repartidas en 69 días.
    const { ventana, filas } = diasCobertura({
      resumen, saldos, desde: '2026-01-01', hasta: '2026-03-10', hoy: '2026-03-10'
    })
    assert.equal(ventana.dias, 69)
    assert.equal(filas.length, 1)
    const [fila] = filas
    assert.equal(fila.unidades, 105)
    assert.equal(fila.diasConVenta, 2)
    assert.equal(fila.promedioDiario, 52.5)
    assert.equal(fila.stock, 290)
    assert.equal(fila.cobertura, 5.5) // 290 / 52.5
    assert.equal(fila.estado, 'warning') // 3 a 7 días: hay que reponer, no es crítico
  })

  it('ordena por urgencia y marca crítico lo que dura menos de 3 días', () => {
    // Dos productos: Pan se acaba en menos de 6 días, Leche en unas horas.
    const dos = new Map([
      ...resumen,
      [LECHE, { unidades: 10, costo: 50, dias: new Map([['2026-03-10', 10]]) }]
    ])
    const { filas } = diasCobertura({
      resumen: dos,
      saldos: new Map([[PAN, { almacen: 275, quiosco: 15 }], [LECHE, { almacen: 0, quiosco: 3 }]]),
      nombrePorProducto: new Map([[PAN, 'Pan'], [LECHE, 'Leche']]),
      desde: '2026-01-01',
      hasta: '2026-03-10',
      hoy: '2026-03-10'
    })
    assert.equal(filas.length, 2)
    assert.equal(filas[0].nombre, 'Leche')
    assert.equal(filas[0].cobertura, 0.3)
    assert.equal(filas[0].estado, 'error')
    assert.equal(filas[1].nombre, 'Pan')
    assert.equal(filas[1].estado, 'warning')
  })

  it('un producto sin ventas en la ventana no sale, en vez de cobertura cero', () => {
    const { filas } = diasCobertura({
      resumen, saldos, desde: '2026-02-01', hasta: '2026-02-28', hoy: '2026-03-10'
    })
    assert.equal(filas.length, 0)
  })
})

describe('analitica: antigüedad del stock', () => {
  // Libro aparte a propósito: capital dormido ES stock que no se movió, así
  // que aquí no hay ni ventas ni traspasos, solo dos compras sin vender.
  const D1 = entrada(100, 10, '2026-01-01', ms('2026-01-01'))
  const D2 = entrada(50, 20, '2026-02-01', ms('2026-02-01'))
  const DORMIDO = [...D1.movimientos, ...D2.movimientos]
  const saldos = saldosDesdeMovimientos(DORMIDO.map(m => ({
    productoId: m.productoId,
    loteId: m.loteId,
    deltaAlmacen: m.deltaAlmacen,
    deltaQuiosco: m.deltaQuiosco,
    anulado: m.anulado
  })))
  const r = antiguedadLotes({
    lotes: [...D1.lotes, ...D2.lotes],
    saldos,
    hoy: '2026-03-10',
    nombrePorProducto: new Map([[PAN, 'Pan']])
  })

  it('solo cuenta los lotes con saldo', () => {
    assert.equal(r.lotes.length, 2)
    assert.equal(r.lotes.find(l => l.precioUnitario === 10).saldo, 100)
    assert.equal(r.lotes.find(l => l.precioUnitario === 20).saldo, 50)
    assert.equal(r.totalUnidades, 150)
  })

  it('los días se cuentan desde la entrada del lote', () => {
    const viejo = r.lotes.find(l => l.precioUnitario === 10)
    assert.equal(viejo.dias, 68) // 01-01 → 10-03
    assert.equal(viejo.tramo, '60+')
    assert.equal(r.lotes.find(l => l.precioUnitario === 20).dias, 37)
    assert.equal(r.lotes.find(l => l.precioUnitario === 20).tramo, '31-60')
  })

  it('el valor pendiente usa el precio del propio lote', () => {
    // 100 x 10 = 1000 y 50 x 20 = 1000. Valorizar todo al precio nuevo daría 3000.
    assert.equal(r.lotes.find(l => l.precioUnitario === 10).valor, 1000)
    assert.equal(r.totalValor, 2000)
  })

  it('el más viejo va arriba y la antigüedad media pondera por valor', () => {
    assert.equal(r.lotes[0].precioUnitario, 10)
    // (1000 x 68 + 1000 x 37) / 2000 = 52.5
    assert.equal(antiguedadMediaPonderada(r.lotes), 52.5)
  })

  it('un lote anulado no se contabiliza', () => {
    const conAnulado = antiguedadLotes({
      lotes: [...D1.lotes, { ...D2.lotes[0], anulado: true }],
      saldos,
      hoy: '2026-03-10'
    })
    assert.equal(conAnulado.lotes.length, 1)
    assert.equal(conAnulado.totalValor, 1000)
  })

  it('agrupa por tramos sin perder ni un peso de la plata', () => {
    const suma = r.porTramo.reduce((s, t) => s + t.valor, 0)
    assert.equal(suma, r.totalValor)
    assert.equal(r.porTramo.length, 5)
    assert.equal(r.porTramo.find(t => t.clave === '60+').valor, 1000)
    assert.equal(r.porTramo.find(t => t.clave === '31-60').valor, 1000)
    // Los tres tramos vacíos valen 0, no NaN.
    assert.equal(r.porTramo.find(t => t.clave === '0-7').valor, 0)
  })
})

describe('analitica: valor y estado del stock', () => {
  const filas = [
    { nombre: 'Pan', almacen: 50, quiosco: 25, valorizadoAlmacen: 500, valorizadoQuiosco: 250, stockMinimoQuiosco: 5, stockRecomendadoQuiosco: 20, stockMinimoAlmacen: 20, seVende: true },
    { nombre: 'Leche', almacen: 4, quiosco: 1, valorizadoAlmacen: 40, valorizadoQuiosco: 10, stockMinimoQuiosco: 5, stockRecomendadoQuiosco: 20, stockMinimoAlmacen: 20, seVende: true },
    { nombre: 'Café', almacen: 30, quiosco: 15, valorizadoAlmacen: 300, valorizadoQuiosco: 150, stockMinimoQuiosco: 5, stockRecomendadoQuiosco: 20, stockMinimoAlmacen: 20, seVende: true },
    { nombre: 'Refresco', almacen: 12, quiosco: 6, valorizadoAlmacen: 120, valorizadoQuiosco: 60, stockMinimoQuiosco: 5, stockRecomendadoQuiosco: 20, stockMinimoAlmacen: 20, seVende: false }
  ]

  it('los totales valorizan por ubicación y suman el todo', () => {
    const t = totalesValorInventario(filas)
    assert.equal(t.almacen, 960)
    assert.equal(t.quiosco, 470)
    assert.equal(t.total, 1430)
    assert.equal(t.unidadesAlmacen, 96)
    assert.equal(t.unidadesQuiosco, 47)
    assert.equal(t.productos, 4)
  })

  it('el estado sale de los mínimos de la ubicación que se mira', () => {
    assert.equal(estadoDeFila(filas[0], 'quiosco').estado, 'ok')
    assert.equal(estadoDeFila(filas[1], 'quiosco').estado, 'bajo-minimo')
    // Café: 15 en quiosco, por debajo del recomendado de 20 pero arriba del mínimo 5.
    assert.equal(estadoDeFila(filas[2], 'quiosco').estado, 'reponer')
    // En almacén solo importa el mínimo de almacén: Café (30) y Pan (50) están bien.
    assert.equal(estadoDeFila(filas[2], 'almacen').estado, 'ok')
    // Desactivado del quiosco: conserva su stock pero no se marca como faltante.
    assert.equal(estadoDeFila(filas[3], 'quiosco').estado, 'no-se-vende')
    assert.equal(estadoDeFila(filas[3], 'almacen').estado, 'bajo-minimo')
  })

  it('el pie cuenta los cuatro estados con su texto', () => {
    const conteo = conteoEstadoStock(filas, 'quiosco')
    assert.deepEqual(conteo.map(c => c.estado), ['OK', 'Reponer', 'Bajo mínimo', 'No se vende'])
    assert.deepEqual(conteo.map(c => c.cantidad), [1, 1, 1, 1])
    // En almacén "Refresco" (12 de 20) es una pieza más de plata parada:
    // no aparece como "no se vende", que es un estado del quiosco.
    assert.deepEqual(conteoEstadoStock(filas, 'almacen').map(c => c.cantidad), [2, 0, 2, 0])
  })
})

describe('rotarPrecioCompra', () => {
  const producto = { id: PAN, precioCompraActual: 10, precioVentaActual: 15 }
  const vigente = { id: 'vigente-1', vigenteDesde: meta.ahora - 86400000 }

  it('mismo precio con vigente no rota', () => {
    assert.equal(rotarPrecioCompra({ producto, vigente, nuevoPrecio: 10, ahora: meta.ahora, usuarioId: JEFE }), null)
  })

  it('precio distinto cierra el vigente y abre uno nuevo con espejo', () => {
    const r = rotarPrecioCompra({ producto, vigente, nuevoPrecio: 12, ahora: meta.ahora, usuarioId: JEFE })
    assert.equal(r.cerrarId, 'vigente-1')
    assert.equal(r.nuevoHistorial.productoId, PAN)
    assert.equal(r.nuevoHistorial.precioCompra, 12)
    assert.equal(r.nuevoHistorial.precioVenta, 15)
    assert.equal(r.nuevoHistorial.vigenteHasta, null)
    assert.equal(r.espejo, 12)
    assert.ok(r.nuevoHistorial.vigenteDesde >= meta.ahora)
  })

  it('sin vigente crea historial sin cerrar nada', () => {
    const r = rotarPrecioCompra({ producto, vigente: null, nuevoPrecio: 12, ahora: meta.ahora, usuarioId: JEFE })
    assert.equal(r.cerrarId, null)
    assert.equal(r.cerrarHasta, null)
    assert.equal(r.nuevoHistorial.vigenteDesde, meta.ahora)
    assert.equal(r.espejo, 12)
  })

  it('sin vigente y mismo precio también crea (no hay nada que comparar)', () => {
    const r = rotarPrecioCompra({ producto, vigente: null, nuevoPrecio: 10, ahora: meta.ahora, usuarioId: JEFE })
    assert.equal(r.cerrarId, null)
    assert.equal(r.nuevoHistorial.precioCompra, 10)
  })

  it('tolera precio como texto y redondea la comparación', () => {
    assert.equal(rotarPrecioCompra({ producto, vigente, nuevoPrecio: '10', ahora: meta.ahora, usuarioId: JEFE }), null)
    const r = rotarPrecioCompra({ producto, vigente, nuevoPrecio: '12.5', ahora: meta.ahora, usuarioId: JEFE })
    assert.equal(r.nuevoHistorial.precioCompra, 12.5)
  })

  it('el nuevo rango no pisa al vigente: empieza al menos 1 ms después', () => {
    const r = rotarPrecioCompra({ producto, vigente, nuevoPrecio: 12, ahora: meta.ahora, usuarioId: JEFE })
    assert.ok(r.nuevoHistorial.vigenteDesde > vigente.vigenteDesde)
    assert.equal(r.cerrarHasta, r.nuevoHistorial.vigenteDesde - 1)
  })

  it('con varias abiertas las cierra todas y arranca después de la última', () => {
    const abiertos = [
      { id: 'v-1', vigenteDesde: meta.ahora - 86400000 },
      { id: 'v-2', vigenteDesde: meta.ahora - 3600000 },
      { id: 'v-3', vigenteDesde: meta.ahora - 1000 }
    ]
    const r = rotarPrecioCompra({ producto, abiertos, nuevoPrecio: 12, ahora: meta.ahora, usuarioId: JEFE })
    assert.deepEqual(r.cierres.map(c => c.id), ['v-1', 'v-2', 'v-3'])
    // El rango nuevo arranca después de la última abierta: sin esto, el
    // producto queda con dos filas vigentes a la vez.
    assert.equal(r.nuevoHistorial.vigenteDesde, meta.ahora)
    for (const c of r.cierres) assert.equal(c.hasta, r.nuevoHistorial.vigenteDesde - 1)
    // El contrato de siempre sigue siendo la primera abierta.
    assert.equal(r.cerrarId, 'v-1')
    assert.equal(r.cerrarHasta, r.cierres[0].hasta)
  })

  it('una abierta con vigenteDesde ISO no produce NaN', () => {
    const iso = '2026-07-11T19:13:55.004Z'
    const r = rotarPrecioCompra({
      producto,
      abiertos: [{ id: 'v-iso', vigenteDesde: iso }],
      nuevoPrecio: 12,
      ahora: meta.ahora,
      usuarioId: JEFE
    })
    assert.equal(Number.isFinite(r.nuevoHistorial.vigenteDesde), true)
    assert.ok(r.nuevoHistorial.vigenteDesde > Date.parse(iso))
    assert.ok(r.cierres[0].hasta >= Date.parse(iso))
  })

  it('precio igual no rota, aunque haya duplicados abiertos', () => {
    // Una entrada al mismo precio no genera historial (contrato de siempre).
    // Los duplicados que quedaran abiertos se cierran en el siguiente cambio
    // de precio, que es el camino que usan producto y entrada.
    const abiertos = [
      { id: 'v-1', vigenteDesde: meta.ahora - 2000 },
      { id: 'v-2', vigenteDesde: meta.ahora - 1000 }
    ]
    assert.equal(rotarPrecioCompra({ producto, abiertos, nuevoPrecio: 10, ahora: meta.ahora, usuarioId: JEFE }), null)
  })
})

describe('calcularRotacionHistorial', () => {
  it('sin abiertas arranca en ahora', () => {
    const { vigenteDesde, cierres } = calcularRotacionHistorial({ abiertos: [], ahora: 5000 })
    assert.equal(vigenteDesde, 5000)
    assert.deepEqual(cierres, [])
  })

  it('arranca un ms después de la última abierta', () => {
    const { vigenteDesde, cierres } = calcularRotacionHistorial({
      abiertos: [{ id: 'a', vigenteDesde: 1000 }, { id: 'b', vigenteDesde: 9000 }],
      ahora: 5000
    })
    assert.equal(vigenteDesde, 9001)
    assert.deepEqual(cierres, [{ id: 'a', hasta: 9000 }, { id: 'b', hasta: 9000 }])
  })

  it('nunca invierte un rango (hasta >= desde)', () => {
    const { vigenteDesde, cierres } = calcularRotacionHistorial({
      abiertos: [{ id: 'futura', vigenteDesde: 999999999 }],
      ahora: 1000
    })
    assert.equal(vigenteDesde, 1000000000)
    assert.equal(cierres[0].hasta, 999999999)
    assert.ok(cierres[0].hasta >= 999999999)
  })
})
