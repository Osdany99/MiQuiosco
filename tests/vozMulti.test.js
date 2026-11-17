import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { agruparPorProducto, dividirSegmentos, segmentarVentaMultiple } from '../shared/voz/multi.js'
import { fraseVentaMultiple } from '../app/utils/voice/frasesVoz.js'

describe('voz: varias líneas — segmentación', () => {
  it('parte por comas, «y» y «con»', () => {
    assert.deepEqual(dividirSegmentos('vende 2 panes y 1 refresco'), ['vende 2 panes', '1 refresco'])
    assert.deepEqual(dividirSegmentos('anota 2 panes, 1 leche'), ['anota 2 panes', '1 leche'])
    assert.deepEqual(dividirSegmentos('vende 2 panes con un refresco'), ['vende 2 panes', 'un refresco'])
  })

  it('vuelve a unir los números compuestos', () => {
    assert.deepEqual(dividirSegmentos('vende treinta y cinco panes'), ['vende treinta y cinco panes'])
    assert.equal(segmentarVentaMultiple('vende treinta y cinco panes'), null)
  })

  it('una sola línea no es una venta múltiple', () => {
    assert.equal(segmentarVentaMultiple('vende dos panes'), null)
    assert.equal(segmentarVentaMultiple(''), null)
  })

  it('cada segmento trae producto y cantidad', () => {
    const r = segmentarVentaMultiple('vende 3 panes y 2 refrescos')
    assert.equal(r.segmentos.length, 2)
    assert.equal(r.segmentos[0].productoHint, 'panes')
    assert.equal(r.segmentos[0].cantidad, 3)
    assert.equal(r.segmentos[1].productoHint, 'refrescos')
    assert.equal(r.segmentos[1].cantidad, 2)
    assert.equal(r.tipoVenta, 'directa')
  })

  it('la ubicación dicha una vez vale para toda la venta', () => {
    const r = segmentarVentaMultiple('vende 2 panes de quiosco y 1 refresco')
    assert.equal(r.ubicacion, 'quiosco')
  })

  it('dos ubicaciones distintas no se adivinan', () => {
    assert.equal(segmentarVentaMultiple('vende 2 panes de quiosco y 1 refresco de almacen'), null)
  })

  it('un segmento sin producto anula la venta múltiple', () => {
    assert.equal(segmentarVentaMultiple('vende 2 panes y 3'), null)
  })
})

describe('voz: varias líneas — agrupación', () => {
  it('suma las líneas del mismo producto', () => {
    const r = agruparPorProducto([
      { productoId: 'p1', nombre: 'Pan', cantidad: 2, precioUnitario: 10 },
      { productoId: 'p2', nombre: 'Refresco', cantidad: 1, precioUnitario: 50 },
      { productoId: 'p1', nombre: 'Pan', cantidad: 3, precioUnitario: 10 }
    ])
    assert.equal(r.length, 2)
    assert.equal(r[0].cantidad, 5)
    assert.equal(r[1].cantidad, 1)
  })

  it('dos precios del mismo producto no se mezclan', () => {
    assert.equal(agruparPorProducto([
      { productoId: 'p1', nombre: 'Pan', cantidad: 2, precioUnitario: 10 },
      { productoId: 'p1', nombre: 'Pan', cantidad: 1, precioUnitario: 12 }
    ]), null)
  })

  it('una cantidad inválida anula la agrupación', () => {
    assert.equal(agruparPorProducto([{ productoId: 'p1', cantidad: 0 }]), null)
  })
})

describe('voz: varias líneas — lectura', () => {
  it('nombra cada producto y cierra con el total', () => {
    const texto = fraseVentaMultiple({
      lineas: [
        { cantidad: 3, nombre: 'Pan' },
        { cantidad: 2, nombre: 'Refresco' }
      ],
      lugar: 'almacén',
      importe: 70
    })
    assert.equal(
      texto,
      'Voy a vender 3 unidades de Pan y 2 unidades de Refresco del almacén por 70 pesos.'
    )
  })

  it('un solo producto se lee sin «y»', () => {
    const texto = fraseVentaMultiple({
      lineas: [{ cantidad: 2, nombre: 'Pan' }],
      lugar: 'quiosco',
      importe: 20
    })
    assert.equal(texto, 'Voy a vender 2 unidades de Pan del quiosco por 20 pesos.')
  })
})
