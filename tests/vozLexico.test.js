import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LEXICO_BASE, crearLexico } from '../shared/voz/lexico.js'
import { UBICACIONES } from '../shared/voz/ubicaciones.js'
import { resolverComando } from '../shared/voz/gramatica.js'
import { validarEntrada } from '../shared/schemas/vozLexico.js'
import { evaluarCambio } from '../shared/voz/evaluarCambio.js'
import { FRASES_DORADAS } from '../shared/voz/frasesDoradas.js'

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

describe('voz: léxico — probar entrada (simulador)', () => {
  it('añadir un verbo nuevo se ve como cambio en las plantillas', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'liquida' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['liquida pan']
    })
    assert.equal(r.regresiones.length, 0)
    assert.equal(r.cambios.length, 1)
    assert.equal(r.cambios[0].antes, 'desconocido')
    assert.equal(r.cambios[0].despues, 'venta_directa')
    assert.ok(r.cambios[0].campos.includes('comando'))
    assert.equal(r.motivo, null)
  })

  it('una palabra que ya existe no cambia nada y lo explica', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'vende' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['vende dos panes']
    })
    assert.deepEqual(r.cambios, [])
    assert.equal(r.motivo, 'ya_existe')
  })

  it('sin plantillas lo dice en vez de devolver ceros mudos', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'liquida' }, {
      frasesDoradas: FRASES_DORADAS
    })
    assert.equal(r.motivo, 'sin_plantillas')
  })

  it('avisa cuando ninguna plantilla usa la palabra', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'liquida' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['vende dos panes']
    })
    assert.equal(r.motivo, 'ninguna_plantilla_la_usa')
  })

  it('rechaza palabras reservadas con un motivo legible', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'almacen' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['almacen dos panes']
    })
    assert.equal(r.motivo, 'palabra_reservada')
  })

  it('detecta el conflicto de una palabra nueva que vive en otro flujo', () => {
    // «sirveme» ya se añadió a venta débil: intentar ponerlo en traspaso es el
    // mismo 409 que devuelve el servidor, y el panel debe explicarlo antes.
    const conSinonimo = crearLexico(LEXICO_BASE, [
      { categoria: 'venta_debil', valor: 'sirveme' }
    ])
    const r = evaluarCambio(conSinonimo, { categoria: 'traspaso_verbo', valor: 'sirveme' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['sirveme dos panes']
    })
    assert.equal(r.motivo, 'conflicto_categoria')
  })

  it('simula retirar una palabra y reporta la regresión', () => {
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_fuerte', valor: 'vende', activo: false }, {
      frasesDoradas: FRASES_DORADAS
    })
    const frase = r.regresiones.find(x => x.frase === 'vende cinco panes')
    assert.ok(frase)
    assert.equal(frase.antes, 'venta_directa')
    assert.equal(frase.despues, 'desconocido')
    assert.ok(frase.campos.includes('comando'))
    assert.equal(r.motivo, null)
  })

  it('detecta cambios de slots aunque el comando sea el mismo', () => {
    // «sirveme» sin léxico se lee como producto; al añadirlo a venta débil el
    // comando sigue siendo venta_directa, pero el producto ya no lo incluye.
    const r = evaluarCambio(LEXICO_BASE, { categoria: 'venta_debil', valor: 'sirveme' }, {
      frasesDoradas: FRASES_DORADAS,
      plantillas: ['sirveme dos panes']
    })
    assert.equal(r.cambios.length, 1)
    assert.equal(r.cambios[0].antes, 'venta_directa')
    assert.equal(r.cambios[0].despues, 'venta_directa')
    assert.ok(r.cambios[0].campos.includes('producto'))
    assert.equal(r.cambios[0].campos.includes('comando'), false)
  })
})

describe('voz: ubicaciones — una sola lista', () => {
  it('el mapa de ubicaciones y el del servicio nativo no se separan', () => {
    // El servicio nativo (app cerrada) lleva su propia copia en
    // `assets/voz/dialogo.json`. Si alguien añade un sinónimo en un lado y no
    // en el otro, el mismo dictado se entiende distinto según dónde se diga.
    const aqui = dirname(fileURLToPath(import.meta.url))
    const dialogo = JSON.parse(
      readFileSync(join(aqui, '..', 'shared', 'voz', 'dialogo.json'), 'utf8')
    )
    assert.deepEqual(dialogo.ubicaciones, { ...UBICACIONES })
  })

  it('cada nombre conocido resuelve a su ubicación canónica', () => {
    assert.equal(UBICACIONES.kiosco, 'quiosco')
    assert.equal(UBICACIONES.quiosco, 'quiosco')
    assert.equal(UBICACIONES.almacen, 'almacen')
    assert.equal(UBICACIONES.deposito, 'almacen')
  })
})
