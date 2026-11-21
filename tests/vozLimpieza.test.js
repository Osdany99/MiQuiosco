import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { limpiarFrase } from '../shared/voz/limpieza.js'
import { resolverComando } from '../shared/voz/gramatica.js'

describe('voz: limpieza de muletillas y cortesías', () => {
  it('quita el eco del wake al inicio', () => {
    assert.equal(limpiarFrase('oye nova vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('oye vende dos panes').texto, 'vende dos panes')
  })

  it('quita muletillas de borde al final', () => {
    assert.equal(limpiarFrase('vende dos panes por favor').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes gracias').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes ya').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes ahora').texto, 'vende dos panes')
  })

  it('quita cortesía tras el verbo', () => {
    assert.equal(limpiarFrase('vende por favor dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('fia por favor dos panes a juan').texto, 'fia dos panes a juan')
  })

  it('quita muletillas al inicio', () => {
    assert.equal(limpiarFrase('oye vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('mira vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('bueno vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('a ver vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('por favor vende dos panes').texto, 'vende dos panes')
  })

  it('quita tartamudeo (verbo repetido)', () => {
    assert.equal(limpiarFrase('vende vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('dame dame cinco panes').texto, 'dame cinco panes')
  })

  it('no toca nada dentro del tramo de producto', () => {
    assert.equal(limpiarFrase('pan con ya').texto, 'pan con ya')
    assert.equal(limpiarFrase('vende dos panes con ya').texto, 'vende dos panes con ya')
    assert.equal(limpiarFrase('refresco de la casa').texto, 'refresco de la casa')
  })

  it('casos reales del plan', () => {
    assert.equal(limpiarFrase('oye vende dos panes por favor').texto, 'vende dos panes')
    assert.equal(limpiarFrase('fia dos panes a juan por favor').texto, 'fia dos panes a juan')
    assert.equal(limpiarFrase('pan con ya').texto, 'pan con ya')
    assert.equal(limpiarFrase('vende vende dos panes').texto, 'vende dos panes')
  })

  it('no rompe frases limpias', () => {
    assert.equal(limpiarFrase('vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('cuanto hay de pan').texto, 'cuanto hay de pan')
    assert.equal(limpiarFrase('').texto, '')
  })

  it('devuelve quitadas no vacío cuando limpió', () => {
    const r = limpiarFrase('vende dos panes por favor')
    assert.ok(r.quitadas.length > 0)
  })

  it('devuelve quitadas vacío cuando no limpió', () => {
    const r = limpiarFrase('vende dos panes')
    assert.deepEqual(r.quitadas, [])
  })

  it('flag desactivado devuelve el texto tal cual', () => {
    const r = limpiarFrase('vende dos panes por favor', false)
    assert.equal(r.texto, 'vende dos panes por favor')
    assert.deepEqual(r.quitadas, [])
  })

  it('aplicar limpieza mejora la intención en resolverComando', () => {
    assert.equal(resolverComando('oye vende dos panes por favor').comando, 'venta_directa')
    assert.equal(resolverComando('fia dos panes a juan por favor').comando, 'venta_fiada')
  })

  it('no toca el nombre del producto cuando hay muletilla dentro', () => {
    assert.equal(limpiarFrase('vende pan con queso por favor').texto, 'vende pan con queso')
  })

  it('quita muletillas combinadas', () => {
    assert.equal(limpiarFrase('oye vende dos panes por favor ya').texto, 'vende dos panes')
  })

  it('maneja texto con un solo token', () => {
    assert.equal(limpiarFrase('hola').texto, 'hola')
  })

  it('no devuelve vacío si todo se quitó', () => {
    const r = limpiarFrase('por favor')
    assert.ok(r.texto.length > 0)
  })
})
