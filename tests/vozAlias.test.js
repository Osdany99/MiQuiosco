import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_ALIAS_POR_PRODUCTO,
  agregarAliasConTope,
  aliasCoincide,
  esAliasValido,
  normalizarAlias,
  textoParaAlias
} from '../shared/voz/alias.js'
import { crearEmparejador } from '../app/utils/voice/emparejarCatalogo.js'
import { decidirProducto, UMBRAL_PRODUCTO } from '../shared/voz/gramatica.js'

const CATALOGO = [
  { productoId: 'p1', nombre: 'Bombillo LED 9W', precioVentaActual: 100, quiosco: 5, almacen: 5 },
  { productoId: 'p2', nombre: 'Bombillo 12W', precioVentaActual: 120, quiosco: 4, almacen: 4 },
  { productoId: 'p3', nombre: 'Pan de leche', precioVentaActual: 20, quiosco: 10, almacen: 10 }
]

describe('voz: alias — validación', () => {
  it('normaliza como el resto del intérprete', () => {
    assert.equal(normalizarAlias('  BOMBI  '), 'bombi')
    assert.equal(normalizarAlias('Pan  de  Leche'), 'pan de leche')
  })

  it('rechaza gramática, números y lo demasiado corto', () => {
    assert.equal(esAliasValido('de la'), false)
    assert.equal(esAliasValido('dos'), false)
    assert.equal(esAliasValido('vende'), false)
    assert.equal(esAliasValido('ab'), false)
    assert.equal(esAliasValido('quiosco'), false)
  })

  it('rechaza el nombre oficial del producto: no aporta nada', () => {
    assert.equal(esAliasValido('bombillo led 9w', { nombresProductos: ['Bombillo LED 9W'] }), false)
  })

  it('acepta jerga y frases con partículas', () => {
    assert.equal(esAliasValido('bombi'), true)
    assert.equal(esAliasValido('pan de la casa'), true)
  })
})

describe('voz: alias — texto aprendido', () => {
  it('quita verbo y cantidad', () => {
    assert.equal(textoParaAlias('vende dos bombis'), 'bombis')
    assert.equal(textoParaAlias('anota fiado un pan de leche'), 'pan de leche')
  })

  it('quita el cliente de un fiado', () => {
    assert.equal(textoParaAlias('fia dos panes a juan'), 'panes')
  })

  it('conserva las partículas internas del producto', () => {
    assert.equal(textoParaAlias('vende pan de la casa'), 'pan de la casa')
  })
})

describe('voz: alias — coincidencia', () => {
  it('compara palabras completas, no trozos', () => {
    assert.equal(aliasCoincide('bombi', 'bombi'), true)
    assert.equal(aliasCoincide('dos bombis', 'bombi'), true)
    assert.equal(aliasCoincide('panqueque', 'pan'), false)
    assert.equal(aliasCoincide('pan de leche', 'pan de la casa'), false)
  })

  it('tolera plurales', () => {
    assert.equal(aliasCoincide('dos bombis', 'bombi'), true)
    assert.equal(aliasCoincide('panes', 'pan'), true)
  })
})

describe('voz: alias — emparejador', () => {
  const aliases = [{ texto: 'bombi', productoId: 'p1' }]

  it('el alias encuentra un producto que el fuzzy no ve', () => {
    const sinAlias = crearEmparejador(CATALOGO, 0.8)('bombis')
    assert.equal(sinAlias.find(c => c.row.productoId === 'p1')?.score > 0.5, false)

    const conAlias = crearEmparejador(CATALOGO, 0.8, aliases)('bombis')
    const mejor = decidirProducto(conAlias, { umbral: UMBRAL_PRODUCTO, sttConfidence: 0.8 })
    assert.equal(mejor.elegido?.row?.productoId, 'p1')
  })

  it('un alias no elige si hay otro producto igual de bueno', () => {
    const dos = [
      { texto: 'bombi', productoId: 'p1' },
      { texto: 'bombi', productoId: 'p2' }
    ]
    const candidatos = crearEmparejador(CATALOGO, 0.8, dos)('bombi')
    const decision = decidirProducto(candidatos, { umbral: UMBRAL_PRODUCTO, sttConfidence: 0.8 })
    assert.equal(decision.elegido, null)
  })

  it('sin coincidencia el alias no altera nada', () => {
    const conAlias = crearEmparejador(CATALOGO, 0.8, aliases)('pan de leche')
    assert.equal(conAlias[0].row.productoId, 'p3')
  })
})

describe('voz: alias — tope por producto', () => {
  it('descarta el menos usado cuando se pasa del máximo', () => {
    const actuales = [
      { id: 'a1', productoId: 'p1', aciertos: 5, creadoEn: 1 },
      { id: 'a2', productoId: 'p1', aciertos: 0, creadoEn: 2 },
      { id: 'a3', productoId: 'p1', aciertos: 2, creadoEn: 3 },
      { id: 'a4', productoId: 'p1', aciertos: 1, creadoEn: 4 },
      { id: 'a5', productoId: 'p1', aciertos: 1, creadoEn: 5 }
    ]
    const nuevo = { id: 'a6', productoId: 'p1', aciertos: 0, creadoEn: 6 }
    const lista = agregarAliasConTope(actuales, nuevo)
    assert.equal(lista.filter(a => a.productoId === 'p1').length, MAX_ALIAS_POR_PRODUCTO)
    assert.equal(lista.some(a => a.id === 'a2'), false)
    assert.equal(lista.some(a => a.id === 'a6'), true)
  })

  it('no toca los alias de otros productos', () => {
    const actuales = [
      { id: 'b1', productoId: 'p2', aciertos: 0, creadoEn: 1 },
      { id: 'a1', productoId: 'p1', aciertos: 0, creadoEn: 1 }
    ]
    const lista = agregarAliasConTope(actuales, { id: 'a2', productoId: 'p1', aciertos: 0, creadoEn: 2 })
    assert.equal(lista.some(a => a.id === 'b1'), true)
  })
})
