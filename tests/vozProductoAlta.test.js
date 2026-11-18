import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar } from '../shared/voz/gramatica.js'
import { fraseProductoAlta } from '../app/utils/voice/frasesVoz.js'

describe('voz: alta de producto (P4c)', () => {
  it('saca el nombre y el precio dictados', () => {
    const r = interpretar('crea un producto pan de leche a 25 pesos')
    assert.equal(r.comando, 'producto_alta')
    assert.equal(r.slots.nombre, 'pan de leche')
    assert.equal(r.slots.precio, 25)
  })

  it('el precio es opcional', () => {
    const r = interpretar('agrega el producto refresco cola')
    assert.equal(r.comando, 'producto_alta')
    assert.equal(r.slots.nombre, 'refresco cola')
    assert.equal(r.slots.precio, null)
  })

  it('tolera «nuevo producto» y «de nombre»', () => {
    assert.deepEqual(interpretar('nuevo producto agua mineral a 10').slots, {
      nombre: 'agua mineral',
      precio: 10
    })
    assert.deepEqual(interpretar('crea un producto de nombre agua mineral').slots, {
      nombre: 'agua mineral',
      precio: null
    })
  })

  it('sin la palabra «producto» sigue siendo una venta', () => {
    assert.equal(interpretar('crea 3 panes').comando, 'venta_directa')
    assert.equal(interpretar('registra 2 panes').comando, 'venta_directa')
  })

  it('la frase dice el nombre y, si se dictó, el precio', () => {
    assert.equal(
      fraseProductoAlta({ nombre: 'Pan de leche', precio: 25 }),
      'Voy a crear el producto Pan de leche a 25 pesos. Revisa y confirma.'
    )
    assert.equal(
      fraseProductoAlta({ nombre: 'Pan de leche' }),
      'Voy a crear el producto Pan de leche. Revisa y confirma.'
    )
  })
})
