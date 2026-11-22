import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  FRASE_NO_ANOTADO,
  MAX_PREGUNTAS,
  decidirSlotFaltante,
  parsearRespuestaSlot,
  traeNumero
} from '../app/utils/voice/slotFaltante.js'

describe('voz: ¿qué le falta al comando? (F4)', () => {
  it('vende pan pregunta cuántos', () => {
    const falta = decidirSlotFaltante('venta_directa', { cantidad: 1, productoHint: 'pan' }, 'vende pan')
    assert.deepEqual(falta, { falta: 'cantidad', pregunta: '¿Cuántos?' })
  })

  it('vende dos panes no pregunta', () => {
    assert.equal(decidirSlotFaltante('venta_directa', { cantidad: 2, productoHint: 'pan' }, 'vende dos panes'), null)
    assert.equal(decidirSlotFaltante('venta_directa', { cantidad: 12, productoHint: 'pan' }, 'vende 12 panes'), null)
  })

  it('fia pan a juan pregunta cuántos', () => {
    assert.equal(
      decidirSlotFaltante('venta_fiada', { cantidad: 1 }, 'fia pan a juan').falta,
      'cantidad'
    )
    assert.equal(decidirSlotFaltante('venta_fiada', { cantidad: 2 }, 'fia dos panes a juan'), null)
  })

  it('cobra a juan pregunta cuánto', () => {
    assert.deepEqual(
      decidirSlotFaltante('cobro_deuda', { monto: 'todo' }, 'cobra a juan'),
      { falta: 'monto', pregunta: '¿Cuánto?' }
    )
  })

  it('cobra todo a juan no pregunta: lo dijo el jefe', () => {
    assert.equal(decidirSlotFaltante('cobro_deuda', { monto: 'todo' }, 'cobra todo a juan'), null)
    assert.equal(decidirSlotFaltante('cobro_deuda', { monto: 'todo' }, 'cobra la deuda de juan'), null)
  })

  it('cobra 200 a juan no pregunta', () => {
    assert.equal(decidirSlotFaltante('cobro_deuda', { monto: 200 }, 'cobra 200 a juan'), null)
  })

  it('los demás comandos no preguntan nada', () => {
    for (const comando of ['consulta_stock', 'consulta_precio', 'entrada_inventario', 'cambio_precio', 'traspaso', 'cuadre_accion', 'ayuda']) {
      assert.equal(decidirSlotFaltante(comando, {}, 'lo que sea'), null, comando)
    }
  })

  it('el tope son 2 preguntas', () => {
    assert.equal(MAX_PREGUNTAS, 2)
    assert.equal(FRASE_NO_ANOTADO, 'No la anoté.')
  })

  it('traeNumero distingue «vende pan» de «vende un pan»', () => {
    assert.equal(traeNumero('vende pan'), false)
    assert.equal(traeNumero('vende un pan'), true)
    assert.equal(traeNumero('vende dos panes'), true)
    assert.equal(traeNumero('vende 12 panes'), true)
    assert.equal(traeNumero('vende media docena'), true)
  })
})

describe('voz: respuesta a «¿Cuántos?»', () => {
  it('acepta la forma suelta', () => {
    assert.deepEqual(parsearRespuestaSlot('tres'), { valor: 3 })
    assert.deepEqual(parsearRespuestaSlot('200'), { valor: 200 })
    assert.deepEqual(parsearRespuestaSlot('veinte'), { valor: 20 })
  })

  it('acepta la corrección hablada (reutiliza el criterio de correccion.js)', () => {
    assert.deepEqual(parsearRespuestaSlot('no, eran tres'), { valor: 3 })
    assert.deepEqual(parsearRespuestaSlot('pon seis'), { valor: 6 })
    assert.deepEqual(parsearRespuestaSlot('cambia a cinco'), { valor: 5 })
  })

  it('un «no» no es una cantidad', () => {
    assert.equal(parsearRespuestaSlot('no'), null)
    assert.equal(parsearRespuestaSlot('ya'), null)
    assert.equal(parsearRespuestaSlot('nada'), null)
    assert.equal(parsearRespuestaSlot(''), null)
    assert.equal(parsearRespuestaSlot('no sé'), null)
  })

  it('ignora cantidades absurdas', () => {
    // Cero no es una cantidad vendible.
    assert.equal(parsearRespuestaSlot('0'), null)
    assert.equal(parsearRespuestaSlot('ninguna'), null)
  })
})
