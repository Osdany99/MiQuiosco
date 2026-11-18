import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_CADUCIDAD,
  etiquetaAntiguedad,
  estaCaducada,
  puedeAplicar,
  proyectarStock,
  resumenPendientes
} from '../app/utils/voice/pendientes.js'
import { construirSnapshot, inicioDelDia, SNAPSHOT_VERSION } from '../app/utils/voice/snapshot.js'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** Mediodía local de un día concreto: evita que el test cruce la medianoche. */
function mediodia(anio, mes, dia) {
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0).getTime()
}

const AHORA = mediodia(2026, 11, 14)

function accion(extra = {}) {
  return {
    id: `a-${Math.random()}`,
    estado: 'pendiente',
    productoId: 'p1',
    productoNombre: 'Pan de leche',
    ubicacion: 'quiosco',
    cantidad: 1,
    precioUnitario: 10,
    importe: 10,
    dictadoEn: AHORA - 5 * MINUTO,
    ...extra
  }
}

const CATALOGO = [
  { productoId: 'p1', nombre: 'Pan de leche', quiosco: 5, almacen: 20, precioVentaActual: 10, seVende: true },
  { productoId: 'p2', nombre: 'Refresco', quiosco: 3, almacen: 10, precioVentaActual: 25, seVende: true }
]

describe('pendientes de voz: stock proyectado', () => {
  it('descuenta solo lo pendiente de la ubicación que corresponde', () => {
    const filas = proyectarStock(CATALOGO, [
      accion({ cantidad: 2, importe: 20 }),
      accion({ cantidad: 3, ubicacion: 'almacen', importe: 30 })
    ])
    const pan = filas.find(f => f.productoId === 'p1')
    assert.equal(pan.quiosco, 3)
    assert.equal(pan.almacen, 17)
    assert.equal(pan.quioscoReal, 5)
    assert.equal(pan.almacenReal, 20)
    assert.equal(pan.pendienteQuiosco, 2)
    assert.equal(pan.pendienteAlmacen, 3)
  })

  it('suma varias acciones del mismo producto y ubicación', () => {
    const [pan] = proyectarStock([CATALOGO[0]], [
      accion({ cantidad: 1 }),
      accion({ cantidad: 2 })
    ])
    assert.equal(pan.quiosco, 2)
    assert.equal(pan.pendienteQuiosco, 3)
  })

  it('ignora acciones aplicadas, archivadas o sin producto', () => {
    const filas = proyectarStock(CATALOGO, [
      accion({ estado: 'aplicada', cantidad: 2 }),
      accion({ estado: 'archivada', cantidad: 2 }),
      accion({ productoId: null, cantidad: 2 })
    ])
    assert.deepEqual(filas, CATALOGO)
  })

  it('no deja stock negativo si lo pendiente supera lo real', () => {
    const [pan] = proyectarStock([CATALOGO[0]], [accion({ cantidad: 9 })])
    assert.equal(pan.quiosco, 0)
    assert.equal(pan.pendienteQuiosco, 9)
  })

  it('devuelve la misma lista si no hay nada pendiente', () => {
    assert.equal(proyectarStock(CATALOGO, []), CATALOGO)
  })
})

describe('pendientes de voz: antigüedad y caducidad', () => {
  it('etiqueta la antigüedad en unidades legibles', () => {
    assert.equal(etiquetaAntiguedad(AHORA, AHORA), 'ahora mismo')
    assert.equal(etiquetaAntiguedad(AHORA - 5 * MINUTO, AHORA), 'hace 5 min')
    assert.equal(etiquetaAntiguedad(AHORA - 3 * HORA, AHORA), 'hace 3 h')
    assert.equal(etiquetaAntiguedad(AHORA - 26 * HORA, AHORA), 'ayer')
    assert.equal(etiquetaAntiguedad(AHORA - 4 * DIA, AHORA), 'hace 4 días')
  })

  it('caduca pasado el tope de seguridad, no antes', () => {
    assert.equal(estaCaducada(AHORA - DIAS_CADUCIDAD * DIA, AHORA), false)
    assert.equal(estaCaducada(AHORA - (DIAS_CADUCIDAD * DIA + 1), AHORA), true)
  })

  it('solo se aplican pendientes, con producto, cantidad y dentro del tope', () => {
    assert.equal(puedeAplicar(accion(), { ahora: AHORA }), true)
    assert.equal(puedeAplicar(accion({ estado: 'aplicada' }), { ahora: AHORA }), false)
    assert.equal(puedeAplicar(accion({ productoId: null }), { ahora: AHORA }), false)
    assert.equal(puedeAplicar(accion({ cantidad: 0 }), { ahora: AHORA }), false)
    assert.equal(puedeAplicar(accion({ dictadoEn: AHORA - 8 * DIA }), { ahora: AHORA }), false)
  })
})

describe('pendientes de voz: resumen para la pantalla', () => {
  it('cuenta pendientes, suma importes y separa caducadas', () => {
    const resumen = resumenPendientes([
      accion({ importe: 0.1 }),
      accion({ importe: 0.2 }),
      accion({ importe: 20, dictadoEn: AHORA - 8 * DIA }),
      accion({ importe: 99, estado: 'aplicada' })
    ], { ahora: AHORA })
    assert.equal(resumen.cantidad, 3)
    assert.equal(resumen.importe, 20.3)
    assert.equal(resumen.caducadas, 1)
  })
})

describe('snapshot para el servicio nativo', () => {
  it('incluye productos con stock ya proyectado y la versión', () => {
    const snap = construirSnapshot({
      puestoId: 'puesto-1',
      filas: CATALOGO,
      acciones: [accion({ cantidad: 2 })],
      ventas: [],
      ahora: AHORA
    })
    assert.equal(snap.version, SNAPSHOT_VERSION)
    assert.equal(snap.puestoId, 'puesto-1')
    const pan = snap.productos.find(p => p.id === 'p1')
    assert.equal(pan.quiosco, 3)
    assert.equal(pan.precio, 10)
    assert.equal(pan.seVende, true)
    assert.equal(snap.resumen.pendientes, 1)
    assert.equal(snap.resumen.importePendiente, 10)
  })

  it('conserva el stock real y lo apartado, no solo el proyectado', () => {
    const snap = construirSnapshot({
      puestoId: 'puesto-1',
      filas: CATALOGO,
      acciones: [accion({ cantidad: 2 })],
      ahora: AHORA
    })
    const pan = snap.productos.find(p => p.id === 'p1')
    // El servicio necesita los dos números para poder decir "sólo quedan N
    // libres, M están apartadas por revisar".
    assert.equal(pan.quiosco, 3)
    assert.equal(pan.quioscoReal, 5)
    assert.equal(pan.pendienteQuiosco, 2)
    assert.equal(pan.pendienteAlmacen, 0)
  })

  it('sin pendientes, el real es el proyectado y no hay apartado', () => {
    const snap = construirSnapshot({ puestoId: 'puesto-1', filas: CATALOGO, acciones: [] })
    const pan = snap.productos.find(p => p.id === 'p1')
    assert.equal(pan.quiosco, 5)
    assert.equal(pan.quioscoReal, 5)
    assert.equal(pan.pendienteQuiosco, 0)
  })

  it('lleva el léxico administrable para la app cerrada', () => {
    const snap = construirSnapshot({
      puestoId: 'puesto-1',
      filas: [],
      acciones: [],
      lexico: {
        ventaFuerte: ['vende', 'liquida'],
        fiadoVerbo: ['fia'],
        fiadoVentaVerbo: ['vende'],
        cobroVerbo: ['cobra'],
        cobroMarca: ['pago'],
        retiradas: [{ categoria: 'venta_fuerte', valor: 'saca' }]
      },
      ahora: AHORA
    })
    assert.deepEqual(snap.lexico.ventaFuerte, ['vende', 'liquida'])
    assert.deepEqual(snap.lexico.retiradas, [{ categoria: 'venta_fuerte', valor: 'saca' }])
    // Sin léxico no se inventa una sección vacía que el servicio malinterprete.
    assert.equal(construirSnapshot({ filas: [], ahora: AHORA }).lexico, null)
  })

  it('resume solo las ventas de hoy no anuladas', () => {
    const snap = construirSnapshot({
      filas: [],
      acciones: [],
      ventas: [
        { creadoEn: AHORA - HORA, montoTotal: 15.5 },
        { creadoEn: AHORA - 2 * HORA, montoTotal: 4.5 },
        { creadoEn: AHORA - HORA, montoTotal: 100, anulado: true },
        { creadoEn: AHORA - 2 * DIA, montoTotal: 50 }
      ],
      ahora: AHORA
    })
    assert.equal(snap.resumen.ventasHoy, 2)
    assert.equal(snap.resumen.importeHoy, 20)
  })

  it('`inicioDelDia` cae en la medianoche local', () => {
    const inicio = new Date(inicioDelDia(AHORA))
    assert.equal(inicio.getHours(), 0)
    assert.equal(inicio.getMinutes(), 0)
    assert.equal(inicio.getSeconds(), 0)
  })
})
