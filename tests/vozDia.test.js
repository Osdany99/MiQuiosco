import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar, resolverComando } from '../shared/voz/gramatica.js'
import {
  esConsultaDia,
  esConsultaGanancia,
  formatearDia,
  formatearGanancia,
  formatearMonto,
  gananciaCuadreDia,
  gananciaDelDia,
  inicioDelDia,
  resumirDia
} from '../shared/voz/dia.js'
import { construirSnapshot } from '../app/utils/voice/snapshot.js'

/** Mediodía local: evita que el test cruce la medianoche. */
const AHORA = new Date(2026, 10, 16, 12, 0, 0, 0).getTime()
const HORA = 60 * 60 * 1000

function venta(extra = {}) {
  return {
    id: `v-${Math.random()}`,
    montoTotal: 20,
    creadoEn: AHORA - HORA,
    ...extra
  }
}

function accion(extra = {}) {
  return {
    id: `a-${Math.random()}`,
    estado: 'pendiente',
    cantidad: 2,
    precioUnitario: 10,
    importe: 20,
    ...extra
  }
}

describe('voz: resumen del día — clasificación', () => {
  const casos = [
    ['como va el dia', 'consulta_dia'],
    ['cómo va el día', 'consulta_dia'],
    ['como va la venta', 'consulta_dia'],
    ['cuanto vendi hoy', 'consulta_dia'],
    ['cuanto he vendido hoy', 'consulta_dia'],
    ['ventas de hoy', 'consulta_dia'],
    ['ventas del dia', 'consulta_dia'],
    ['resumen del dia', 'consulta_dia'],
    ['cierre del dia', 'consulta_dia'],
    ['cuanto llevo hoy', 'consulta_dia']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('«cuánto vendí» sin día no se contesta', () => {
    assert.equal(esConsultaDia('cuanto vendi'), false)
    assert.notEqual(resolverComando('cuanto vendi').comando, 'consulta_dia')
  })

  it('la ganancia y la caja se clasifican aparte del resumen', () => {
    assert.equal(esConsultaDia('cuanto gane hoy'), false)
    assert.equal(esConsultaDia('ganancia de hoy'), false)
    assert.equal(esConsultaDia('como va la caja'), false)
    assert.equal(resolverComando('cuanto gane hoy').comando, 'consulta_ganancia')
    assert.equal(resolverComando('ganancia del dia').comando, 'consulta_ganancia')
    assert.equal(resolverComando('como va la caja').comando, 'consulta_caja')
    assert.equal(resolverComando('cuanto hay en caja').comando, 'consulta_caja')
  })

  it('«cuánto gané» sin día no se contesta', () => {
    assert.notEqual(resolverComando('cuanto gane').comando, 'consulta_ganancia')
  })

  it('no se confunde con stock, precio ni deudas', () => {
    assert.equal(resolverComando('cuanto hay de pan').comando, 'consulta_stock')
    assert.equal(resolverComando('cuanto cuesta el pan').comando, 'consulta_precio')
    assert.equal(resolverComando('cuanto debe juan').comando, 'consulta_deuda')
  })

  it('interpretar() pone la fecha en null cuando se habla de hoy', () => {
    const r = interpretar('como va el dia')
    assert.equal(r.comando, 'consulta_dia')
    assert.deepEqual(r.slots, { fecha: null })
  })
})

describe('voz: resumen del día — cálculo', () => {
  it('cuenta solo las ventas de hoy y no las anuladas', () => {
    const r = resumirDia({
      ahora: AHORA,
      ventas: [
        venta({ montoTotal: 20 }),
        venta({ montoTotal: 15.5 }),
        venta({ montoTotal: 100, anulado: true }),
        venta({ montoTotal: 50, creadoEn: AHORA - 3 * 24 * HORA })
      ]
    })
    assert.equal(r.ventasHoy, 2)
    assert.equal(r.importeHoy, 35.5)
  })

  it('los dictados pendientes no suman al importe vendido', () => {
    const r = resumirDia({
      ahora: AHORA,
      ventas: [venta({ montoTotal: 20 })],
      acciones: [accion(), accion({ estado: 'aplicada' }), accion({ estado: 'caducada' })]
    })
    assert.equal(r.ventasHoy, 1)
    assert.equal(r.importeHoy, 20)
    assert.equal(r.pendientes, 1)
    assert.equal(r.importePendiente, 20)
  })

  it('suma los dictados del buzón nativo', () => {
    const r = resumirDia({ ahora: AHORA, ventas: [], acciones: [accion()], dictados: 2 })
    assert.equal(r.pendientes, 3)
  })

  it('sin ventas devuelve ceros', () => {
    const r = resumirDia({ ahora: AHORA })
    assert.deepEqual(
      { ventasHoy: r.ventasHoy, importeHoy: r.importeHoy, pendientes: r.pendientes },
      { ventasHoy: 0, importeHoy: 0, pendientes: 0 }
    )
  })

  it('inicioDelDia deja la medianoche local', () => {
    const d = new Date(inicioDelDia(AHORA))
    assert.equal(d.getHours(), 0)
    assert.equal(d.getMinutes(), 0)
  })
})

describe('voz: resumen del día — respuesta', () => {
  it('lee ventas e importe, con los pendientes aparte', () => {
    const r = formatearDia({ ventasHoy: 12, importeHoy: 845, pendientes: 2 })
    assert.equal(r.habla, 'Hoy: 12 ventas por 845 pesos. 2 dictados por revisar.')
    assert.match(r.titulo, /12 ventas/)
  })

  it('una sola venta en singular', () => {
    const r = formatearDia({ ventasHoy: 1, importeHoy: 20, pendientes: 1 })
    assert.equal(r.habla, 'Hoy: 1 venta por 20 pesos. 1 dictado por revisar.')
  })

  it('los centavos se leen con coma', () => {
    const r = formatearDia({ ventasHoy: 3, importeHoy: 35.5, pendientes: 0 })
    assert.equal(r.habla, 'Hoy: 3 ventas por 35,50 pesos.')
  })

  it('sin ventas lo dice sin inventar cero pesos', () => {
    assert.equal(formatearDia({ ventasHoy: 0, importeHoy: 0, pendientes: 0 }).habla,
      'Todavía no hay ventas hoy.')
    assert.equal(formatearDia({ ventasHoy: 0, importeHoy: 0, pendientes: 3 }).habla,
      'Todavía no hay ventas hoy. Hay 3 dictados por revisar.')
  })

  it('los importes se formatean como se hablan', () => {
    assert.equal(formatearMonto(845), '845')
    assert.equal(formatearMonto(845.5), '845,50')
    assert.equal(formatearMonto(null), '0')
  })
})

describe('voz: ganancia del día', () => {
  it('suma la ganancia de las ventas de hoy, sin anuladas', () => {
    const r = resumirDia({
      ahora: AHORA,
      ventas: [
        venta({ montoTotal: 20, ganancia: 8 }),
        venta({ montoTotal: 15, ganancia: 5.5 }),
        venta({ montoTotal: 100, ganancia: 40, anulado: true }),
        venta({ montoTotal: 50, ganancia: 20, creadoEn: AHORA - 3 * 24 * HORA })
      ]
    })
    assert.equal(r.gananciaHoy, 13.5)
  })

  it('una venta sin ganancia no rompe la suma', () => {
    const r = resumirDia({ ahora: AHORA, ventas: [venta({ montoTotal: 20 })] })
    assert.equal(r.gananciaHoy, 0)
  })

  it('la lectura junta ganancia e importe vendido', () => {
    const r = formatearGanancia({ ventasHoy: 2, importeHoy: 845, gananciaHoy: 320 })
    assert.equal(r.habla, 'Hoy ganaste 320 pesos de 845 vendidos.')
  })

  it('una pérdida se dice como pérdida', () => {
    const r = formatearGanancia({ ventasHoy: 1, importeHoy: 20, gananciaHoy: -5.5 })
    assert.equal(r.habla, 'Hoy perdiste 5,50 pesos de 20 vendidos.')
  })

  it('sin ventas no inventa una ganancia', () => {
    assert.equal(
      formatearGanancia({ ventasHoy: 0, importeHoy: 0, gananciaHoy: 0, gananciaOrigen: 'vacio' }).habla,
      'Todavía no hay ventas hoy, así que no hay ganancia.'
    )
  })

  it('usa el cuadre cerrado cuando existe', () => {
    const r = resumirDia({
      ahora: AHORA,
      ventas: [venta({ montoTotal: 100, ganancia: 30 })],
      cuadres: [{ fecha: '2026-11-16', estado: 'cerrado', ganancia: 55, actualizadoEn: AHORA }],
      deudasDirectas: [],
      movimientos: []
    })
    assert.equal(r.gananciaHoy, 55)
    assert.equal(r.gananciaOrigen, 'cuadre')
    assert.match(formatearGanancia(r).habla, /ganaste 55 pesos/)
  })

  it('si el cuadre está abierto, avisa y usa fuera de cuadre', () => {
    const r = resumirDia({
      ahora: AHORA,
      ventas: [venta({ montoTotal: 100, ganancia: 30 })],
      cuadres: [{ fecha: '2026-11-16', estado: 'abierto', ganancia: null }],
      deudasDirectas: [{ creadoEn: AHORA, montoTotal: 20, ganancia: 7 }],
      movimientos: [{ creadoEn: AHORA, tipo: 'merma', importe: 5 }]
    })
    assert.equal(r.gananciaHoy, 32)
    assert.equal(r.gananciaOrigen, 'abierto')
    assert.match(formatearGanancia(r).habla, /El cuadre de hoy está abierto/)
    assert.match(formatearGanancia(r).habla, /Fuera de cuadre vas 32 pesos/)
  })

  it('gananciaDelDia: sin cuadre usa ventas directas, deudas directas y mermas', () => {
    const r = gananciaDelDia({
      fecha: '2026-11-16',
      desde: inicioDelDia(AHORA),
      hasta: inicioDelDia(AHORA) + 24 * 60 * 60 * 1000 - 1,
      ventas: [venta({ montoTotal: 100, ganancia: 30 })],
      deudasDirectas: [{ creadoEn: AHORA, montoTotal: 20, ganancia: 7 }],
      movimientos: [{ creadoEn: AHORA, tipo: 'merma', importe: 5 }]
    })
    assert.deepEqual({ origen: r.origen, monto: r.monto }, { origen: 'fuera_de_cuadre', monto: 32 })
  })

  it('un cuadre duplicado del modo offline no suma dos veces', () => {
    // El duplicado sale del modo sin conexión: no hay índice único. La gráfica
    // deduplica por puesto+fecha y gana el más reciente; la voz hace lo mismo.
    const cuadres = [
      { id: 'a', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 50, actualizadoEn: AHORA - HORA },
      { id: 'b', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 55, actualizadoEn: AHORA }
    ]
    assert.deepEqual(gananciaCuadreDia(cuadres, '2026-11-16'), { monto: 55, cerrados: 1, sinGanancia: 0 })
    const r = gananciaDelDia({ fecha: '2026-11-16', cuadres, desde: inicioDelDia(AHORA) })
    assert.equal(r.monto, 55)
    assert.equal(r.origen, 'cuadre')
  })

  it('la ganancia de otro puesto no entra en la cifra de este', () => {
    const cuadres = [
      { id: 'propio', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 40, actualizadoEn: AHORA },
      { id: 'ajeno', puestoId: 'p2', fecha: '2026-11-16', estado: 'cerrado', ganancia: 900, actualizadoEn: AHORA }
    ]
    assert.equal(gananciaCuadreDia(cuadres, '2026-11-16', { puestoId: 'p1' }).monto, 40)
    const r = gananciaDelDia({ fecha: '2026-11-16', cuadres, puestoId: 'p1', desde: inicioDelDia(AHORA) })
    assert.equal(r.monto, 40)
  })

  it('la cifra por voz es la misma que la base de la gráfica', () => {
    // La gráfica reexporta `gananciaCuadreDia`; la voz la llama dentro de
    // `gananciaDelDia`. Si alguna de las dos cambiara de criterio, este test
    // cae: es la garantía de que pantalla y voz no divergen (P3.4).
    const cuadres = [
      { id: 'b', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 120, pagoTrabajador: 20, actualizadoEn: AHORA - HORA },
      { id: 'a', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 130, pagoTrabajador: 20, actualizadoEn: AHORA }
    ]
    const grafica = gananciaCuadreDia(cuadres, '2026-11-16', { puestoId: 'p1' }).monto
    const voz = gananciaDelDia({ fecha: '2026-11-16', cuadres, puestoId: 'p1', desde: inicioDelDia(AHORA) }).monto
    assert.equal(voz, grafica)
    // Gana el registro más reciente (a): 130 − 20.
    assert.equal(voz, 110)
  })

  it('el pago al trabajador se resta igual que en la gráfica', () => {
    const cuadres = [{ id: 'a', puestoId: 'p1', fecha: '2026-11-16', estado: 'cerrado', ganancia: 100, pagoTrabajador: 90 }]
    assert.equal(gananciaCuadreDia(cuadres, '2026-11-16').monto, 10)
  })

  it('exige marca de día', () => {
    assert.equal(esConsultaGanancia('cuanto gane hoy'), true)
    assert.equal(esConsultaGanancia('ganancia del dia'), true)
    assert.equal(esConsultaGanancia('cuanto gane'), false)
    assert.equal(esConsultaGanancia('cuanto cuesta el pan'), false)
  })
})

describe('voz: resumen del día comparte cálculo con el snapshot', () => {
  it('el snapshot y la consulta dicen lo mismo', () => {
    const ventas = [venta({ montoTotal: 20 }), venta({ montoTotal: 15 })]
    const acciones = [accion()]
    const ahora = AHORA

    const snap = construirSnapshot({ puestoId: 'p1', filas: [], acciones, ventas, ahora })
    const directo = resumirDia({ ventas, acciones, ahora })

    assert.equal(snap.resumen.ventasHoy, directo.ventasHoy)
    assert.equal(snap.resumen.importeHoy, directo.importeHoy)
    assert.equal(snap.resumen.pendientes, directo.pendientes)
    assert.equal(snap.resumen.importePendiente, directo.importePendiente)
    assert.equal(snap.resumen.gananciaHoy, directo.gananciaHoy)
    assert.equal(formatearDia(directo).habla, 'Hoy: 2 ventas por 35 pesos. 1 dictado por revisar.')
  })
})
