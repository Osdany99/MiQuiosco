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
  lotesConSaldo
} from '../shared/inventario/operaciones.js'
import { entradaAlmacenSchema } from '../shared/schemas/entradaAlmacen.js'
import { traspasoSchema, ajusteInventarioSchema } from '../shared/schemas/traspaso.js'
import { productoSchema } from '../shared/schemas/producto.js'
import { ventaDirectaSchema, deudaDirectaSchema, pagoFiadoDirectoSchema } from '../shared/schemas/directas.js'
import { pagoFiadoSchema } from '../shared/schemas/pagoFiado.js'
import { vistaSaldos } from '../shared/inventario/vista.js'

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
