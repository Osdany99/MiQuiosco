import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  esVentaFiada,
  extraerClienteFiado,
  extraerFiadoSlots,
  interpretar,
  resolverComando
} from '../shared/voz/gramatica.js'
import { fraseFiado } from '../app/utils/voice/frasesVoz.js'
import { pendienteDesdeAccion, pendienteResuelto } from '../app/utils/voice/buzon.js'

describe('voz: fiar — clasificación', () => {
  const casos = [
    ['fia dos panes a juan', 'venta_fiada'],
    ['fía dos panes a Juan', 'venta_fiada'],
    ['fiale cinco refrescos a maria', 'venta_fiada'],
    ['anota fiado dos panes a juan', 'venta_fiada'],
    ['vende fiado un pan a juan', 'venta_fiada'],
    ['fiame una docena de huevos a yunior', 'venta_fiada']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('«cuánto tengo fiado» no es un fiado nuevo', () => {
    assert.equal(esVentaFiada('cuanto tengo fiado'), false)
    assert.notEqual(resolverComando('cuanto tengo fiado').comando, 'venta_fiada')
  })

  it('vender y fiar no se confunden', () => {
    assert.equal(resolverComando('vende dos panes').comando, 'venta_directa')
    assert.equal(resolverComando('cuanto debe juan').comando, 'consulta_deuda')
  })
})

describe('voz: fiar — slots', () => {
  it('separa producto, cantidad y cliente', () => {
    assert.deepEqual(extraerFiadoSlots('fia dos panes a juan'), {
      productoHint: 'panes',
      cantidad: 2,
      ubicacion: null,
      clienteHint: 'juan'
    })
  })

  it('respeta la ubicación dicha', () => {
    const slots = extraerFiadoSlots('fia tres refrescos del quiosco a maria')
    assert.equal(slots.productoHint, 'refrescos')
    assert.equal(slots.cantidad, 3)
    assert.equal(slots.ubicacion, 'quiosco')
    assert.equal(slots.clienteHint, 'maria')
  })

  it('conserva apellidos y partículas del nombre', () => {
    assert.equal(extraerClienteFiado('fia dos panes a juan perez'), 'juan perez')
    assert.equal(extraerClienteFiado('fia dos panes a la senora de juan'), 'la senora de juan')
    assert.equal(extraerClienteFiado('anota fiado un pan para yunior 2210'), 'yunior 2210')
  })

  it('sin «a» no hay cliente', () => {
    assert.equal(extraerClienteFiado('fia dos panes'), '')
  })

  it('un producto con «de» no se parte por el cliente', () => {
    const slots = extraerFiadoSlots('fia dos panes de leche a maria')
    assert.equal(slots.productoHint, 'panes de leche')
    assert.equal(slots.clienteHint, 'maria')
  })

  it('interpretar() entrega los slots del comando', () => {
    const r = interpretar('fía dos panes a Juan')
    assert.equal(r.comando, 'venta_fiada')
    assert.equal(r.slots.cantidad, 2)
    assert.equal(r.slots.clienteHint, 'juan')
  })
})

describe('voz: fiar — frase de confirmación', () => {
  it('lee a quién, qué y cuánto', () => {
    const frase = fraseFiado({ cantidad: 2, nombre: 'Pan de leche', cliente: 'Yunior', importe: 40 })
    assert.equal(frase, 'Voy a fiar 2 unidades de Pan de leche a Yunior por 40 pesos. Diga sí para confirmar.')
  })

  it('una unidad usa el singular del producto', () => {
    const frase = fraseFiado({ cantidad: 1, nombre: 'Pan', cliente: 'Ana', importe: 20 })
    assert.match(frase, /Voy a fiar un Pan a Ana por 20 pesos/)
  })

  it('sin importe no inventa un monto', () => {
    const frase = fraseFiado({ cantidad: 1, nombre: 'Pan', cliente: 'Ana' })
    assert.match(frase, /Voy a fiar un Pan a Ana\./)
  })
})

describe('voz: fiar — buzón de la app cerrada', () => {
  it('importa un fiado resuelto solo si trae cliente', () => {
    const base = {
      resuelto: true,
      texto: 'fia dos panes a juan',
      productoId: 'p1',
      productoNombre: 'Pan',
      cantidad: 2,
      precioUnitario: 20,
      ubicacion: 'almacen',
      dictadoEn: 1000,
      tipo: 'deuda',
      clienteId: 'c1',
      clienteNombre: 'Juan'
    }
    const pendiente = pendienteResuelto(base)
    assert.equal(pendiente.tipo, 'deuda')
    assert.equal(pendiente.clienteId, 'c1')
    assert.equal(pendiente.importe, 40)

    const sinCliente = pendienteResuelto({ ...base, clienteId: '' })
    assert.equal(sinCliente, null)
  })

  it('una venta resuelta sigue siendo venta', () => {
    const pendiente = pendienteResuelto({
      resuelto: true,
      texto: 'vende dos panes',
      productoId: 'p1',
      cantidad: 2,
      precioUnitario: 20,
      dictadoEn: 1000
    })
    assert.equal(pendiente.tipo, 'venta')
    assert.equal(pendiente.clienteId, null)
  })

  it('el camino viejo convierte una acción fiar en deuda', () => {
    const entrada = {
      origenId: 'x',
      texto: 'fia dos panes a juan',
      dictadoEn: 1000,
      ubicacion: 'almacen'
    }
    const accion = {
      tipo: 'fiar',
      fila: { productoId: 'p1', nombre: 'Pan', precioVentaActual: 20 },
      cliente: { id: 'c1', nombre: 'Juan' },
      cantidad: 2,
      importe: 40,
      destino: { ubicacion: 'almacen' }
    }
    const pendiente = pendienteDesdeAccion(accion, entrada)
    assert.equal(pendiente.tipo, 'deuda')
    assert.equal(pendiente.clienteId, 'c1')
    assert.equal(pendiente.cantidad, 2)
    assert.equal(pendiente.importe, 40)
    assert.equal(pendiente.ubicacion, 'almacen')
  })
})
