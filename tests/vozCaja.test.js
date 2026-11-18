import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolverComando } from '../shared/voz/gramatica.js'
import { esConsultaCaja, formatearCaja, resumirCaja } from '../shared/voz/caja.js'

const CUADRE = {
  id: 'c1',
  puestoId: 'p1',
  fecha: '2026-11-16',
  estado: 'abierto',
  montoRegalo: 0,
  montoDescuento: 0,
  montoFiado: 0,
  montoTransferencia: 0
}

describe('voz: caja — clasificación', () => {
  const casos = [
    'como va la caja',
    'cómo va la caja',
    'cuanto hay en caja',
    'efectivo esperado'
  ]

  for (const texto of casos) {
    it(`"${texto}" → consulta_caja`, () => {
      assert.equal(esConsultaCaja(texto), true)
      assert.equal(resolverComando(texto).comando, 'consulta_caja')
    })
  }

  it('no se confunde con el resumen del día ni con stock', () => {
    assert.equal(resolverComando('como va el dia').comando, 'consulta_dia')
    assert.equal(resolverComando('cuanto hay de pan').comando, 'consulta_stock')
    assert.equal(esConsultaCaja('cuanto cuesta el pan'), false)
    assert.equal(esConsultaCaja('cuantas cajas de leche quedan'), false)
  })
})

describe('voz: caja — cálculo', () => {
  it('sin cuadre abierto no hay números', () => {
    assert.equal(resumirCaja({ cuadre: null }), null)
    assert.equal(resumirCaja({ cuadre: { ...CUADRE, estado: 'cerrado' } }), null)
  })

  it('suma las líneas y descuenta regalo y descuento', () => {
    const r = resumirCaja({
      cuadre: { ...CUADRE, montoRegalo: 10, montoDescuento: 5 },
      lineas: [
        { subtotal: 100 },
        { subtotal: 50.5 }
      ]
    })
    assert.equal(r.esperado, 135.5)
    assert.equal(r.efectivoEsperado, 135.5)
  })

  it('lo fiado y lo transferido no se esperan en efectivo', () => {
    const r = resumirCaja({
      cuadre: { ...CUADRE, montoFiado: 40, montoTransferencia: 60 },
      lineas: [{ subtotal: 200 }]
    })
    assert.equal(r.esperado, 200)
    assert.equal(r.fiado, 40)
    assert.equal(r.transferencia, 60)
    assert.equal(r.efectivoEsperado, 100)
  })

  it('no maquilla un cuadre incompleto', () => {
    const r = resumirCaja({
      cuadre: { ...CUADRE, montoFiado: 100 },
      lineas: []
    })
    assert.equal(r.esperado, 0)
    assert.equal(r.efectivoEsperado, -100)
  })
})

describe('voz: caja — respuesta', () => {
  it('sin cuadre abierto lo dice y no inventa cero', () => {
    const r = formatearCaja(null)
    assert.equal(r.habla, 'No hay un cuadre abierto.')
    assert.equal(r.tipo, 'caja_sin_cuadre')
  })

  it('lee el efectivo esperado y lo descontado', () => {
    const r = formatearCaja({ esperado: 200, fiado: 40, transferencia: 60, efectivoEsperado: 100 })
    assert.equal(
      r.habla,
      'En caja deberían haber 100 pesos de 200 esperados. Descontados 40 fiados y 60 por transferencia.'
    )
  })

  it('sin fiado ni transferencia no alarga la frase', () => {
    const r = formatearCaja({ esperado: 100, fiado: 0, transferencia: 0, efectivoEsperado: 100 })
    assert.equal(r.habla, 'En caja deberían haber 100 pesos de 100 esperados.')
  })
})
