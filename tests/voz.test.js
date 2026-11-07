import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  UMBRAL_PRODUCTO,
  combinarConfianza,
  decidirProducto,
  extraerSlots,
  interpretar,
  normalizar,
  parseNumberToken,
  resolverComando,
  resolverUbicacion
} from '../shared/voz/gramatica.js'
import { fuzzyMatchProducts } from '../app/utils/voice/fuzzyMatchProducts.js'

describe('voz: normalización y números', () => {
  it('normaliza acentos, mayúsculas y puntuación', () => {
    assert.equal(normalizar('  Vende CINCO Panes, por favor. '), 'vende cinco panes por favor')
    assert.equal(normalizar('¿Cuánto hay de maní?'), 'cuanto hay de mani')
  })

  it('parsea dígitos, decimales y palabras', () => {
    assert.equal(parseNumberToken('5'), 5)
    assert.equal(parseNumberToken('1,5'), 1.5)
    assert.equal(parseNumberToken('2.5'), 2.5)
    assert.equal(parseNumberToken('Cinco'), 5)
    assert.equal(parseNumberToken('veinticinco'), 25)
    assert.equal(parseNumberToken('pan'), null)
  })
})

describe('voz: clasificación (fase A)', () => {
  const casos = [
    ['vende cinco panes', 'venta_directa'],
    ['vendeme 10 mani', 'venta_directa'],
    ['anota un pan', 'venta_directa'],
    ['registra dos refrescos', 'venta_directa'],
    ['cinco panes', 'venta_directa'],
    ['cuanto hay de pan', 'desconocido'],
    ['cuanto queda de refresco', 'desconocido'],
    ['abre cuadre', 'desconocido'],
    ['ir a deudas', 'desconocido'],
    ['hola', 'desconocido'],
    ['', 'desconocido']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('un comando que no existe no se interpreta como venta', () => {
    const r = interpretar('cuanto hay de pan')
    assert.equal(r.comando, 'desconocido')
    assert.equal(r.slots.productoHint, '')
    assert.deepEqual(r.slots, {
      productoHint: '',
      cantidad: 1,
      precioUnitario: null,
      ubicacion: null,
      tipoVenta: 'directa',
      clienteHint: null
    })
  })

  it('el verbo manda sobre el resto', () => {
    assert.equal(resolverComando('vende el stock de pan').comando, 'venta_directa')
  })
})

describe('voz: slots (fase B)', () => {
  it('extrae cantidad, ubicación, precio y cliente', () => {
    const slots = extraerSlots('venta_directa', 'vende cinco panes en almacen a precio de diez a don juan')
    assert.equal(slots.cantidad, 5)
    assert.equal(slots.ubicacion, 'almacen')
    assert.equal(slots.precioUnitario, 10)
    assert.equal(slots.clienteHint, 'juan')
    assert.equal(slots.productoHint, 'panes')
    assert.equal(slots.tipoVenta, 'directa')
  })

  it('entiende singular, plural y artículos', () => {
    const slots = extraerSlots('venta_directa', 'vende un pan')
    assert.equal(slots.cantidad, 1)
    assert.equal(slots.productoHint, 'pan')
  })

  it('detecta el tipo de venta y lo quita del producto', () => {
    assert.equal(extraerSlots('venta_directa', 'vende un pan regalo').tipoVenta, 'regalo')
    assert.equal(extraerSlots('venta_directa', 'vende dos panes de la casa').tipoVenta, 'casa')
    assert.equal(extraerSlots('venta_directa', 'anota tres refrescos familiar').tipoVenta, 'familiar')
  })

  it('"kiosco" es quiosco y no deja basura en el producto', () => {
    const slots = extraerSlots('venta_directa', 'vende dos panes en kiosco')
    assert.equal(slots.ubicacion, 'quiosco')
    assert.equal(slots.productoHint, 'panes')
  })

  it('no confunde "para la casa" con un cliente', () => {
    const slots = extraerSlots('venta_directa', 'vende dos panes para la casa')
    assert.equal(slots.tipoVenta, 'casa')
    assert.equal(slots.clienteHint, null)
  })
})

describe('voz: ubicación', () => {
  it('sin ubicación usa la de la vista', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: null }, 'quiosco'), { ubicacion: 'quiosco', conflicto: false })
  })

  it('la misma ubicación no es conflicto', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: 'almacen' }, 'almacen'), { ubicacion: 'almacen', conflicto: false })
  })

  it('una ubicación distinta es conflicto (nunca vender en silencio)', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: 'almacen' }, 'quiosco'), { ubicacion: 'almacen', conflicto: true })
  })
})

describe('voz: confianza', () => {
  it('sin confianza del STT usa solo el fuzzy', () => {
    assert.equal(combinarConfianza(0.9, 0), 0.9)
    assert.equal(combinarConfianza(0.9, null), 0.9)
  })

  it('nunca infla el score del fuzzy', () => {
    assert.equal(combinarConfianza(0.9, 1), 0.9)
    assert.ok(combinarConfianza(0.9, 0.5) < 0.9)
  })

  it('un STT muy seguro no rescata un match malo (regresión)', () => {
    // 0.65*stt + 0.35*fuzzy habría dado 0.83 y habría precargado el producto.
    const decision = decidirProducto([{ score: 0.6 }], { sttConfidence: 0.95 })
    assert.equal(decision.elegido, null)
    assert.ok(decision.efectivo < UMBRAL_PRODUCTO)
  })

  it('precarga un match bueno y con margen', () => {
    const decision = decidirProducto([{ score: 0.95 }, { score: 0.4 }], { sttConfidence: 0 })
    assert.ok(decision.elegido)
  })

  it('con dos candidatos empatados pregunta en vez de elegir por orden', () => {
    const decision = decidirProducto([{ score: 0.8 }, { score: 0.8 }], { sttConfidence: 0 })
    assert.equal(decision.elegido, null)
    assert.equal(decision.ambiguo, true)
  })

  it('un match exacto gana aunque venga de un catálogo con parecidos', () => {
    const decision = decidirProducto([{ score: 1 }, { score: 0.9 }], { sttConfidence: 0 })
    assert.ok(decision.elegido)
  })
})

describe('voz: fuzzy de productos', () => {
  const catalogo = [
    { id: '1', name: 'Pan' },
    { id: '2', name: 'Pan de leche' },
    { id: '3', name: 'Refresco' },
    { id: '4', name: 'jkf' }
  ]

  it('el plural encuentra el singular', () => {
    const [mejor] = fuzzyMatchProducts('panes', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.equal(mejor.score, 1)
  })

  it('respeta acentos y mayúsculas', () => {
    const [mejor] = fuzzyMatchProducts('REFRÉSCO', catalogo)
    assert.equal(mejor.product.id, '3')
  })

  it('un acrónimo mal transcrito sigue siendo candidato', () => {
    const [mejor] = fuzzyMatchProducts('jk', catalogo)
    assert.equal(mejor.product.id, '4')
    assert.ok(mejor.score >= 0.75)
  })

  it('"pan" prefiere el producto exacto, no el compuesto', () => {
    const [mejor] = fuzzyMatchProducts('pan', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.equal(mejor.score, 1)
  })

  it('sin hint no hay candidatos', () => {
    assert.deepEqual(fuzzyMatchProducts('', catalogo), [])
    assert.deepEqual(fuzzyMatchProducts('zzzzzz', catalogo), [])
  })
})
