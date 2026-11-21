import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { diaDeNegocio, rangoDeDiaNegocio, rangoDeIso, resolverFechaDictada } from '../shared/voz/fechas.js'
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

  it('el día de negocio no depende de la zona del aparato', () => {
    // 2 de la mañana del 18 en UTC son las 9 de la noche del 17 en Cuba. El
    // reloj del aparato (o un teléfono con la hora corrida) diría 18; el día
    // del negocio es el 17.
    const instante = Date.UTC(2026, 10, 18, 2, 0, 0)
    assert.equal(diaDeNegocio(instante), '2026-11-17')
    assert.equal(diaDeNegocio(instante, 0), '2026-11-18')
  })

  it('el rango de un día de negocio va de medianoche a medianoche del negocio', () => {
    const r = rangoDeDiaNegocio('2026-11-16')
    assert.equal(r.inicio, Date.UTC(2026, 10, 16, 5, 0, 0))
    assert.equal(r.hasta, Date.UTC(2026, 10, 17, 4, 59, 59, 999))
    assert.match(r.etiqueta, /^El lunes 16 de noviembre$/)
    assert.equal(rangoDeDiaNegocio('no-es-fecha'), null)
  })

  it('una venta de las 11 y media de la noche cae en su día de negocio', () => {
    const r = rangoDeDiaNegocio('2026-11-16')
    // 23:30 hora del negocio = 04:30 UTC del día siguiente.
    const creadoEn = Date.UTC(2026, 10, 17, 4, 30, 0)
    const resumen = resumirDia({ ventas: [{ creadoEn, montoTotal: 100, ganancia: 20 }], desde: r.inicio, hasta: r.hasta })
    assert.equal(resumen.ventasHoy, 1)
    assert.equal(resumen.gananciaHoy, 20)
  })
})

describe('voz: ayer y anteayer', () => {
  // Mediodía del 17 en UTC, que en Cuba es la mañana del 17.
  const AHORA = Date.UTC(2026, 10, 17, 12, 0, 0)

  it('«ayer» y «anteayer» se resuelven al día de negocio anterior', () => {
    const ayer = resolverFechaDictada('cuanto gane ayer', { ahora: AHORA })
    assert.equal(ayer.iso, '2026-11-16')
    assert.equal(ayer.etiqueta, 'Ayer')
    assert.equal(ayer.inicio, Date.UTC(2026, 10, 16, 5, 0, 0))

    const anteayer = resolverFechaDictada('cuanto vendi anteayer', { ahora: AHORA })
    assert.equal(anteayer.iso, '2026-11-15')
    assert.equal(anteayer.etiqueta, 'Anteayer')
  })

  it('las variantes del habla cubana también cuentan', () => {
    for (const dicho of ['antier', 'antiayer', 'antayer']) {
      const r = resolverFechaDictada(`cuanto vendi ${dicho}`, { ahora: AHORA })
      assert.equal(r?.iso, '2026-11-15', `«${dicho}» no se entendió`)
    }
  })

  it('«cuánto gané ayer» es una consulta de ganancia con fecha', () => {
    for (const frase of ['cuanto gane ayer', 'cuanto me gane ayer', 'cuanto gane antier']) {
      const r = interpretar(frase, undefined, { ahora: AHORA })
      assert.equal(r.comando, 'consulta_ganancia', `«${frase}» cayó en ${r.comando}`)
      assert.match(r.slots.fecha, /^2026-11-1[56]$/)
    }
    // Sin marca de día sigue siendo ambiguo: no se adivina.
    assert.equal(interpretar('cuanto gane', undefined, { ahora: AHORA }).comando, 'desconocido')
  })

  it('«cuánto vendí ayer» y «cómo fue ayer» son el resumen del día', () => {
    const vendi = interpretar('cuanto vendi ayer', undefined, { ahora: AHORA })
    assert.equal(vendi.comando, 'consulta_dia')
    assert.equal(vendi.slots.fecha, '2026-11-16')

    const comoFue = interpretar('como fue ayer', undefined, { ahora: AHORA })
    assert.equal(comoFue.comando, 'consulta_dia')
    assert.equal(comoFue.slots.fecha, '2026-11-16')
  })

  it('la frase hablada dice el día, no «Hoy»', () => {
    const rango = resolverFechaDictada('cuanto gane ayer', { ahora: AHORA })
    const resumen = resumirDia({
      ventas: [{ creadoEn: Date.UTC(2026, 10, 16, 18), montoTotal: 250, ganancia: 60 }],
      desde: rango.inicio,
      hasta: rango.hasta
    })
    assert.match(formatearGanancia(resumen, { cuando: rango.etiqueta }).habla, /^Ayer ganaste 60 pesos/)
    assert.match(formatearDia(resumen, { cuando: rango.etiqueta }).habla, /^Ayer: 1 venta por 250 pesos/)
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
