import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { LEXICO_BASE, crearLexico } from '../shared/voz/lexico.js'
import { resolverComando } from '../shared/voz/gramatica.js'
import { validarEntrada } from '../shared/schemas/vozLexico.js'

const sinSaca = crearLexico(LEXICO_BASE, [
  { categoria: 'venta_fuerte', valor: 'saca', activo: false }
])

describe('voz: léxico — tombstones y retirada', () => {
  it('desactivar una palabra base la quita solo de su categoría', () => {
    assert.equal(sinSaca.ventaFuerte.includes('saca'), false)
    assert.equal(sinSaca.ventaFuerte.includes('vende'), true)
    assert.equal(sinSaca.ventaDebil.includes('pon'), true)
    assert.deepEqual(sinSaca.retiradas, [{ categoria: 'venta_fuerte', valor: 'saca' }])
    // La base no se muta: otros léxicos siguen viendo la palabra.
    assert.equal(LEXICO_BASE.ventaFuerte.includes('saca'), true)
  })

  it('una palabra retirada de venta no se resucita por el respaldo', () => {
    assert.deepEqual(
      resolverComando('saca 2 panes', sinSaca),
      { comando: 'desconocido', confianza: 0, reasons: ['palabra_retirada'] }
    )
    // Las demás palabras de venta siguen funcionando igual.
    assert.equal(resolverComando('vende 2 panes', sinSaca).comando, 'venta_directa')
    // Y tampoco arma un fiado por la puerta de atrás.
    assert.notEqual(resolverComando('saca fiado 2 panes a juan', sinSaca).comando, 'venta_fiada')
  })

  it('sin retiradas el comportamiento no cambia', () => {
    assert.equal(resolverComando('saca 2 panes').comando, 'venta_directa')
    assert.equal(resolverComando('cinco panes').comando, 'venta_directa')
  })

  it('permite desactivar una palabra base reservada', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'consulta_marca', valor: 'inventario', activo: false }
    ])
    assert.equal(lexico.consultaMarca.includes('inventario'), false)
    assert.deepEqual(lexico.retiradas, [{ categoria: 'consulta_marca', valor: 'inventario' }])
  })

  it('añade sinónimos y respeta los conflictos entre categorías', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'venta_fuerte', valor: 'factura' }
    ])
    assert.equal(lexico.ventaFuerte.includes('factura'), true)

    const conflicto = validarEntrada(
      { categoria: 'venta_debil', valor: 'factura', activo: true },
      lexico
    )
    assert.equal(conflicto.ok, false)
    assert.equal(conflicto.motivo, 'conflicto_categoria')
  })
})

describe('voz: léxico — consulta_marca se lee del léxico', () => {
  it('una marca nueva hace que la frase se reconozca como stock', () => {
    const lexico = {
      ...LEXICO_BASE,
      consultaMarca: [...LEXICO_BASE.consultaMarca, 'chequea'],
      retiradas: []
    }
    assert.equal(resolverComando('chequea el pan', lexico).comando, 'consulta_stock')
  })

  it('retirar una marca evita que la frase caiga en stock', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'consulta_marca', valor: 'hay', activo: false }
    ])
    assert.notEqual(resolverComando('hay pan', lexico).comando, 'consulta_stock')
    // Las demás marcas siguen vivas.
    assert.equal(resolverComando('cuanto pan queda', lexico).comando, 'consulta_stock')
  })
})

describe('voz: léxico — familias de verbos', () => {
  it('retirar un verbo de merma apaga la merma', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'merma_verbo', valor: 'rompio', activo: false }
    ])
    assert.notEqual(resolverComando('se rompio 2 panes', lexico).comando, 'ajuste_inventario')
    // Otro verbo de la misma familia sigue funcionando.
    assert.equal(resolverComando('se cayo 2 panes', lexico).comando, 'ajuste_inventario')
  })

  it('retirar un verbo de entrada apaga la entrada de lote', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'entrada_verbo', valor: 'entraron', activo: false }
    ])
    assert.notEqual(
      resolverComando('entraron 20 panes a 10 pesos', lexico).comando,
      'entrada_inventario'
    )
    assert.equal(
      resolverComando('llegaron 20 panes a 10 pesos', lexico).comando,
      'entrada_inventario'
    )
  })

  it('retirar un verbo de cobro apaga el cobro', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'cobro_verbo', valor: 'cobra', activo: false }
    ])
    assert.notEqual(resolverComando('cobra 200 a juan', lexico).comando, 'cobro_deuda')
  })

  it('retirar un verbo de transferencia apaga la transferencia', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'transferencia_verbo', valor: 'transfiere', activo: false }
    ])
    assert.notEqual(
      resolverComando('transfiere 500 a juan', lexico).comando,
      'transferencia_cuadre'
    )
  })

  it('retirar un verbo de cuadre apaga la acción', () => {
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'cuadre_abrir', valor: 'abre', activo: false }
    ])
    assert.notEqual(resolverComando('abre el cuadre', lexico).comando, 'cuadre_accion')
  })

  it('permite reasignar una palabra retirada de venta a otro flujo', () => {
    // «saca» deja de ser venta y pasa a ser un verbo de traspaso.
    const lexico = crearLexico(LEXICO_BASE, [
      { categoria: 'venta_fuerte', valor: 'saca', activo: false },
      { categoria: 'traspaso_verbo', valor: 'saca', activo: true }
    ])
    assert.equal(
      resolverComando('saca 2 panes del almacen al quiosco', lexico).comando,
      'traspaso'
    )
    // Sin ubicación no se inventa un traspaso: sigue retirada de venta.
    assert.equal(resolverComando('saca 2 panes', lexico).comando, 'desconocido')
  })
})
