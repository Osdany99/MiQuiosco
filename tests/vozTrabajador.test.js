import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar } from '../shared/voz/gramatica.js'
import { evaluarTrabajador, esRutaCuadre, COMANDOS_TRABAJADOR } from '../shared/voz/trabajador.js'
import { fraseDeudaDinero, fraseTransferencia } from '../app/utils/voice/frasesVoz.js'

describe('voz: trabajador — modo cuadre (P5)', () => {
  it('solo la ruta exacta del cuadre abre el modo', () => {
    assert.equal(esRutaCuadre('/cuadre'), true)
    assert.equal(esRutaCuadre('/cuadre/'), true)
    assert.equal(esRutaCuadre('/cuadres'), false)
    assert.equal(esRutaCuadre('/quiosco'), false)
    assert.equal(esRutaCuadre(''), false)
  })

  it('el jefe nunca pasa por el filtro', () => {
    assert.equal(evaluarTrabajador({ esTrabajador: false, ruta: '/quiosco', comando: 'venta_directa' }), null)
  })

  it('el trabajador fuera del cuadre no puede nada por voz', () => {
    const r = evaluarTrabajador({ esTrabajador: true, ruta: '/quiosco', comando: 'venta_fiada' })
    assert.equal(r.tipo, 'aviso')
    assert.equal(r.motivo, 'trabajador_fuera_cuadre')
  })

  it('dentro del cuadre solo pasa la lista blanca', () => {
    for (const comando of COMANDOS_TRABAJADOR) {
      assert.equal(
        evaluarTrabajador({ esTrabajador: true, ruta: '/cuadre', comando }),
        null,
        `${comando} debería permitirse`
      )
    }
  })

  it('cobrar, consultar, vender, ajustar y cuadre quedan fuera', () => {
    for (const comando of ['cobro_deuda', 'consulta_stock', 'consulta_precio', 'venta_directa', 'entrada_inventario', 'traspaso', 'cambio_precio', 'mover_producto', 'cliente_alta', 'producto_alta', 'ajuste_inventario', 'cuadre_accion']) {
      const r = evaluarTrabajador({ esTrabajador: true, ruta: '/cuadre', comando })
      assert.equal(r?.tipo, 'aviso', `${comando} debería rechazarse`)
      assert.equal(r?.motivo, 'trabajador_comando_no_permitido')
    }
  })
})

describe('voz: deuda de dinero (P5) — interpretación', () => {
  it('«anota que Juan debe 500» saca cliente y monto', () => {
    const r = interpretar('anota que Juan debe 500')
    assert.equal(r.comando, 'deuda_dinero')
    assert.equal(r.slots.clienteHint, 'juan')
    assert.equal(r.slots.monto, 500)
  })

  it('«deuda de 500 a Juan» y «fía 500 pesos a Juan» valen igual', () => {
    for (const texto of ['deuda de 500 a Juan', 'fía 500 pesos a Juan', 'anota una deuda de 800 pesos a Juan']) {
      const r = interpretar(texto)
      assert.equal(r.comando, 'deuda_dinero', texto)
      assert.ok(r.slots.monto > 0, texto)
      assert.equal(r.slots.clienteHint, 'juan', texto)
    }
  })

  it('el artículo «una» no se lee como monto', () => {
    const r = interpretar('anota una transferencia de 500 de María')
    assert.equal(r.slots.monto, 500)
    assert.equal(r.slots.clienteHint, 'maria')
  })

  it('«fía 2 panes a Juan» sigue siendo fiado de producto', () => {
    const r = interpretar('fía 2 panes a Juan')
    assert.equal(r.comando, 'venta_fiada')
    assert.equal(r.slots.cantidad, 2)
  })

  it('«cuánto debe Juan» sigue siendo consulta', () => {
    assert.equal(interpretar('cuánto debe Juan').comando, 'consulta_deuda')
  })

  it('«cobra 200 a Juan por transferencia» sigue siendo cobro', () => {
    const r = interpretar('cobra 200 a Juan por transferencia')
    assert.equal(r.comando, 'cobro_deuda')
    assert.equal(r.slots.formaPago, 'transferencia')
  })
})

describe('voz: transferencia al cuadre (P5) — interpretación', () => {
  it('«transferencia de 500 a Juan» saca cliente y monto', () => {
    const r = interpretar('transferencia de 500 a Juan')
    assert.equal(r.comando, 'transferencia_cuadre')
    assert.equal(r.slots.clienteHint, 'juan')
    assert.equal(r.slots.monto, 500)
  })

  it('«transfiere 500 a Juan» y «Juan me transfirió 500»', () => {
    for (const texto of ['transfiere 500 a Juan', 'Juan me transfirió 500']) {
      const r = interpretar(texto)
      assert.equal(r.comando, 'transferencia_cuadre', texto)
      assert.equal(r.slots.monto, 500, texto)
      assert.equal(r.slots.clienteHint, 'juan', texto)
    }
  })

  it('con ubicación sigue siendo traspaso de inventario', () => {
    const r = interpretar('transfiere 5 panes del almacén al quiosco')
    assert.equal(r.comando, 'traspaso')
  })
})

describe('voz: deuda de dinero y transferencia (P5) — frase', () => {
  it('la deuda de dinero pide el «sí» en la misma locución', () => {
    assert.equal(
      fraseDeudaDinero({ cliente: 'Juan', monto: 500 }),
      'Voy a anotar que Juan debe 500 pesos en el cuadre. Diga sí para confirmar.'
    )
  })

  it('la transferencia nombra el monto y el cliente', () => {
    assert.equal(
      fraseTransferencia({ cliente: 'Juan', monto: 350 }),
      'Voy a registrar una transferencia de 350 pesos de Juan. Diga sí para confirmar.'
    )
  })

  it('sin cliente la transferencia dice «sin cliente»', () => {
    assert.equal(
      fraseTransferencia({ cliente: '', monto: 100 }),
      'Voy a registrar una transferencia de 100 pesos de sin cliente. Diga sí para confirmar.'
    )
  })
})
