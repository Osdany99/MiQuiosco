import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { rangoDeIso, resolverFechaDictada } from '../shared/voz/fechas.js'
import { formatearDia, formatearGanancia, resumirDia } from '../shared/voz/dia.js'
import { interpretar } from '../shared/voz/gramatica.js'

// Martes 17 de noviembre de 2026, mediodía local.
const MARTES = new Date(2026, 10, 17, 12, 0, 0).getTime()

describe('voz: fecha dictada', () => {
  it('el día de la semana es el más reciente ya pasado', () => {
    // Hoy es martes: «el martes» es el de la semana pasada, no hoy.
    assert.equal(resolverFechaDictada('la ganancia del martes', { ahora: MARTES }).iso, '2026-11-10')
    assert.equal(resolverFechaDictada('lo del lunes', { ahora: MARTES }).iso, '2026-11-16')
    assert.equal(resolverFechaDictada('del domingo', { ahora: MARTES }).iso, '2026-11-15')
  })

  it('un día y mes vale el de este año si ya pasó', () => {
    assert.equal(resolverFechaDictada('las ventas del 1 de enero', { ahora: MARTES }).iso, '2026-01-01')
    assert.equal(resolverFechaDictada('las del 5 noviembre', { ahora: MARTES }).iso, '2026-11-05')
  })

  it('si la fecha aún no llegó, se refiere al año pasado', () => {
    assert.equal(resolverFechaDictada('la ganancia del 25 de diciembre', { ahora: MARTES }).iso, '2025-12-25')
  })

  it('una fecha imposible no se inventa', () => {
    assert.equal(resolverFechaDictada('del 31 de febrero', { ahora: MARTES }), null)
    assert.equal(resolverFechaDictada('cuanto ganamos', { ahora: MARTES }), null)
  })

  it('la etiqueta nombra el día para poder leerlo', () => {
    const r = resolverFechaDictada('del 1 de enero', { ahora: MARTES })
    assert.match(r.etiqueta, /^El (jueves|miércoles|viernes) 1 de enero$/)
  })

  it('el rango de un ISO es ese día completo', () => {
    const r = rangoDeIso('2026-11-10')
    const total = r.hasta - r.inicio
    assert.ok(total > 23 * 60 * 60 * 1000 && total < 25 * 60 * 60 * 1000)
    assert.equal(rangoDeIso('no-es-fecha'), null)
  })
})

describe('voz: ganancia de otro día', () => {
  const VENTAS = [
    { creadoEn: new Date(2026, 10, 17, 9).toISOString(), montoTotal: 100, ganancia: 30 },
    { creadoEn: new Date(2026, 10, 10, 9).toISOString(), montoTotal: 200, ganancia: 50 },
    { creadoEn: new Date(2026, 10, 10, 18).toISOString(), montoTotal: 50, ganancia: 10 },
    { creadoEn: new Date(2026, 10, 10, 20).toISOString(), montoTotal: 999, ganancia: 999, anulado: true }
  ]

  it('suma solo el día pedido y descarta anuladas', () => {
    const rango = rangoDeIso('2026-11-10')
    const resumen = resumirDia({ ventas: VENTAS, desde: rango.inicio, hasta: rango.hasta })
    assert.equal(resumen.ventasHoy, 2)
    assert.equal(resumen.importeHoy, 250)
    assert.equal(resumen.gananciaHoy, 60)
  })

  it('la frase nombra el día y el importe', () => {
    const rango = rangoDeIso('2026-11-10')
    const resumen = resumirDia({ ventas: VENTAS, desde: rango.inicio, hasta: rango.hasta })
    const r = formatearGanancia(resumen, { cuando: rango.etiqueta })
    assert.match(r.habla, /^El martes 10 de noviembre ganaste 60 pesos de 250 vendidos\.$/)
  })

  it('un día sin ventas lo dice sin inventar cifras', () => {
    const rango = rangoDeIso('2026-11-03')
    const resumen = resumirDia({ ventas: VENTAS, desde: rango.inicio, hasta: rango.hasta })
    const r = formatearGanancia(resumen, { cuando: rango.etiqueta })
    assert.equal(r.tipo, 'ganancia_vacia')
    assert.match(r.habla, /^El martes 3 de noviembre no hubo ventas/)
  })

  it('el resumen del día también acepta la etiqueta', () => {
    const rango = rangoDeIso('2026-11-10')
    const resumen = resumirDia({ ventas: VENTAS, desde: rango.inicio, hasta: rango.hasta })
    const r = formatearDia(resumen, { cuando: rango.etiqueta })
    assert.match(r.habla, /^El martes 10 de noviembre: 2 ventas por 250 pesos\.$/)
  })

  it('las frases de día con fecha se clasifican con fecha y las de hoy sin ella', () => {
    const martes = interpretar('dime la ganancia del martes')
    assert.equal(martes.comando, 'consulta_ganancia')
    assert.match(martes.slots.fecha, /^\d{4}-\d{2}-\d{2}$/)

    const enero = interpretar('cuanto vendi el 1 de enero')
    assert.equal(enero.comando, 'consulta_dia')
    assert.match(enero.slots.fecha, /^\d{4}-01-01$/)

    assert.equal(interpretar('cuanto gane hoy').slots.fecha, null)
  })
})
