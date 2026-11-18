import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar } from '../shared/voz/gramatica.js'
import { resolverAjuste } from '../app/utils/voice/resolverAsistido.js'
import { fraseAjuste } from '../app/utils/voice/frasesVoz.js'

const CATALOGO = [
  { productoId: 'p1', nombre: 'Pan de leche', almacen: 20, quiosco: 5, precioVentaActual: 10 },
  { productoId: 'p2', nombre: 'Refresco Cola', almacen: 3, quiosco: 2, precioVentaActual: 25 }
]

describe('voz: merma y devolución (P4b) — interpretación', () => {
  it('el verbo fija el motivo canónico y el producto', () => {
    const r = interpretar('se rompieron 3 panes')
    assert.equal(r.comando, 'ajuste_inventario')
    assert.equal(r.slots.productoHint, 'panes')
    assert.equal(r.slots.cantidad, 3)
    assert.equal(r.slots.tipo, 'merma')
    assert.equal(r.slots.motivo, 'rotos')
  })

  it('la cola dictada tras «porque» se conserva con sus acentos', () => {
    const r = interpretar('se cayeron 4 refrescos porque los tumbó el perro')
    assert.equal(r.slots.tipo, 'merma')
    assert.equal(r.slots.motivo, 'se cayó, los tumbó el perro')
  })

  it('la devolución exige decir el almacén', () => {
    const r = interpretar('devuelve 2 refrescos al almacén')
    assert.equal(r.comando, 'ajuste_inventario')
    assert.equal(r.slots.tipo, 'devolucion')
    assert.equal(r.slots.cantidad, 2)
    assert.equal(r.slots.motivo, 'devolución')
    // Sin destino es ambiguo: se queda como venta/duda en vez de mover stock.
    assert.notEqual(interpretar('devuelve 2 refrescos').comando, 'ajuste_inventario')
  })

  it('la ubicación dicha se guarda como slot', () => {
    const r = interpretar('bota 2 refrescos del quiosco')
    assert.equal(r.slots.ubicacion, 'quiosco')
  })

  it('no se come ventas ni entradas', () => {
    assert.equal(interpretar('vende 3 panes').comando, 'venta_directa')
    assert.equal(interpretar('entraron 20 panes a 10 pesos').comando, 'entrada_inventario')
  })
})

describe('voz: merma y devolución (P4b) — resolución', () => {
  it('merma del almacén: comprueba el stock del almacén', () => {
    const r = resolverAjuste(
      { slots: { productoHint: 'panes', cantidad: 3, tipo: 'merma', motivo: 'rotos' } },
      CATALOGO,
      { sttConfidence: 0.95, ubicacion: 'almacen' }
    )
    assert.equal(r.tipo, 'ok')
    assert.equal(r.tipoAjuste, 'merma')
    assert.equal(r.ubicacion, 'almacen')
    assert.equal(r.disponible, 20)
    assert.equal(r.motivo, 'rotos')
  })

  it('la devolución siempre sale del quiosco', () => {
    const r = resolverAjuste(
      { slots: { productoHint: 'refrescos', cantidad: 2, tipo: 'devolucion', motivo: 'x' } },
      CATALOGO,
      { sttConfidence: 0.95, ubicacion: 'almacen' }
    )
    assert.equal(r.tipo, 'ok')
    assert.equal(r.tipoAjuste, 'devolucion')
    assert.equal(r.ubicacion, 'quiosco')
    assert.equal(r.disponible, 2)
  })

  it('no ajusta más de lo que hay en esa ubicación', () => {
    const r = resolverAjuste(
      { slots: { productoHint: 'panes', cantidad: 9, tipo: 'merma', motivo: 'x' } },
      CATALOGO,
      { sttConfidence: 0.95, ubicacion: 'quiosco' }
    )
    assert.equal(r.tipo, 'aviso')
    assert.equal(r.motivo, 'stock_insuficiente')
    assert.equal(r.disponible, 5)
  })
})

describe('voz: merma y devolución (P4b) — frase', () => {
  it('la merma dice dónde y por qué', () => {
    assert.equal(
      fraseAjuste({ tipo: 'merma', cantidad: 3, nombre: 'Pan', motivo: 'rotos', lugar: 'almacen' }),
      'Voy a dar de baja 3 unidades de Pan del almacén. Motivo: rotos. Revisa y confirma.'
    )
  })

  it('la devolución nombra el sentido quiosco → almacén', () => {
    assert.equal(
      fraseAjuste({ tipo: 'devolucion', cantidad: 2, nombre: 'Refresco', motivo: 'sobró', lugar: 'quiosco' }),
      'Voy a devolver 2 unidades de Refresco del quiosco al almacén. Motivo: sobró. Revisa y confirma.'
    )
  })
})
