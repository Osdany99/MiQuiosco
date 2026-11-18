import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar, resolverComando } from '../shared/voz/gramatica.js'
import {
  esConsultaDia,
  esConsultaGanancia,
  formatearDia,
  formatearGanancia,
  formatearMonto,
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
      formatearGanancia({ ventasHoy: 0, importeHoy: 0, gananciaHoy: 0 }).habla,
      'Todavía no hay ventas hoy, así que no hay ganancia.'
    )
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
