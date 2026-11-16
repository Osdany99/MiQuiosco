import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarEntradaBuzon, pendienteDesdeAccion, pendienteResuelto } from '../app/utils/voice/buzon.js'

const ENTRADA = {
  id: 'dictado-1.json',
  texto: 'vende 2 panes',
  confidence: 0.9,
  alternativas: [{ texto: 'vende 2 panes', confidence: 0.9 }],
  dictadoEn: 1763000000000,
  ubicacion: 'quiosco'
}

const FILA = { productoId: 'p1', nombre: 'Pan de leche', precioVentaActual: 10 }

describe('buzón de voz: entrada del servicio', () => {
  it('normaliza una entrada completa', () => {
    const entrada = normalizarEntradaBuzon(ENTRADA)
    assert.equal(entrada.origenId, 'dictado-1.json')
    assert.equal(entrada.texto, 'vende 2 panes')
    assert.equal(entrada.sttConfidence, 0.9)
    assert.equal(entrada.dictadoEn, 1763000000000)
    assert.equal(entrada.ubicacion, 'quiosco')
    assert.deepEqual(entrada.alternativas, [{ texto: 'vende 2 panes', confidence: 0.9 }])
  })

  it('descarta entradas sin texto o sin fecha', () => {
    assert.equal(normalizarEntradaBuzon({ texto: '  ', dictadoEn: 1 }), null)
    assert.equal(normalizarEntradaBuzon({ texto: 'vende pan' }), null)
    assert.equal(normalizarEntradaBuzon(null), null)
  })

  it('acepta alias de campos y descarta una ubicación desconocida', () => {
    const entrada = normalizarEntradaBuzon({ texto: 'vende pan', t: 123, ubicacion: 'techo' })
    assert.equal(entrada.ubicacion, null)
    assert.equal(entrada.dictadoEn, 123)
    assert.equal(entrada.origenId, null)
    assert.deepEqual(entrada.alternativas, [])
  })

  it('tolera alternativas en formato texto plano', () => {
    const entrada = normalizarEntradaBuzon({
      texto: 'vende pan',
      dictadoEn: 1,
      alternativas: ['vende pan', { text: 'vende panes', confidence: 0.5 }, { texto: '  ' }]
    })
    assert.deepEqual(entrada.alternativas, [
      { texto: 'vende pan', confidence: 0 },
      { texto: 'vende panes', confidence: 0.5 }
    ])
  })
})

describe('buzón de voz: venta ya resuelta por el servicio', () => {
  const resuelta = {
    id: 'dictado-9.json',
    resuelto: true,
    texto: 'vende dos panes',
    productoId: 'p1',
    productoNombre: 'Pan de leche',
    cantidad: 2,
    precioUnitario: 10,
    importe: 20,
    ubicacion: 'quiosco',
    tipoVenta: 'directa',
    dictadoEn: 1763000000000,
    confidence: 0.9
  }

  it('se importa sin reinterpretar: producto, cantidad e importe viajan en el fichero', () => {
    const doc = pendienteResuelto(resuelta)
    assert.equal(doc.origenId, 'dictado-9.json')
    assert.equal(doc.productoId, 'p1')
    assert.equal(doc.productoNombre, 'Pan de leche')
    assert.equal(doc.cantidad, 2)
    assert.equal(doc.importe, 20)
    assert.equal(doc.origen, 'servicio')
    assert.equal(doc.motivo, null)
  })

  it('calcula el importe si el servicio no lo mandó', () => {
    const doc = pendienteResuelto({ ...resuelta, importe: undefined })
    assert.equal(doc.importe, 20)
  })

  it('descarta lo que no está resuelto o no trae producto', () => {
    assert.equal(pendienteResuelto({ ...resuelta, resuelto: false }), null)
    assert.equal(pendienteResuelto({ ...resuelta, productoId: '' }), null)
    assert.equal(pendienteResuelto({ ...resuelta, texto: '  ' }), null)
    assert.equal(pendienteResuelto(null), null)
  })
})

describe('buzón de voz: acción pendiente', () => {
  const entrada = normalizarEntradaBuzon(ENTRADA)

  it('una venta resuelta se guarda con producto e importe', () => {
    const doc = pendienteDesdeAccion({
      tipo: 'venta',
      modo: 'directa',
      fila: FILA,
      destino: { ubicacion: 'almacen' },
      cantidad: 2,
      precioUnitario: 10,
      importe: 20,
      slots: { tipoVenta: 'directa', clienteId: 'c1' }
    }, entrada)
    assert.equal(doc.origen, 'servicio')
    assert.equal(doc.origenId, 'dictado-1.json')
    assert.equal(doc.productoId, 'p1')
    assert.equal(doc.productoNombre, 'Pan de leche')
    assert.equal(doc.ubicacion, 'almacen')
    assert.equal(doc.cantidad, 2)
    assert.equal(doc.importe, 20)
    assert.equal(doc.clienteId, 'c1')
    assert.equal(doc.motivo, null)
  })

  it('sin stock se anota con el precio del catálogo y su motivo', () => {
    const doc = pendienteDesdeAccion({
      tipo: 'stock',
      fila: FILA,
      destino: { ubicacion: 'quiosco' },
      cantidad: 5,
      slots: { tipoVenta: 'directa' }
    }, entrada)
    assert.equal(doc.motivo, 'stock_insuficiente')
    assert.equal(doc.precioUnitario, 10)
    assert.equal(doc.importe, 50)
  })

  it('una interpretación ambigua propone el primer candidato sin decidir', () => {
    const doc = pendienteDesdeAccion({
      tipo: 'ambiguo',
      candidatos: [{ row: FILA }],
      slots: { cantidad: 1, tipoVenta: 'directa' }
    }, entrada)
    assert.equal(doc.productoId, 'p1')
    assert.equal(doc.motivo, 'interpretacion_dudosa')
  })

  it('un producto no encontrado conserva el dictado sin producto', () => {
    const doc = pendienteDesdeAccion({
      tipo: 'error',
      motivo: 'producto_no_encontrado',
      texto: 'pan lunar'
    }, entrada)
    assert.equal(doc.productoId, null)
    assert.equal(doc.productoNombre, 'pan lunar')
    assert.equal(doc.motivo, 'producto_no_encontrado')
  })

  it('un tipo de venta desconocido cae a directa', () => {
    const doc = pendienteDesdeAccion({
      tipo: 'venta',
      fila: FILA,
      destino: { ubicacion: 'quiosco' },
      cantidad: 1,
      precioUnitario: 10,
      slots: { tipoVenta: 'mayoreo' }
    }, entrada)
    assert.equal(doc.tipoVenta, 'directa')
  })

  it('navegación, consulta y cancelado no generan acción', () => {
    assert.equal(pendienteDesdeAccion({ tipo: 'navegacion' }, entrada), null)
    assert.equal(pendienteDesdeAccion({ tipo: 'consultar_stock' }, entrada), null)
    assert.equal(pendienteDesdeAccion({ tipo: 'cancelado' }, entrada), null)
    assert.equal(pendienteDesdeAccion(null, entrada), null)
    assert.equal(pendienteDesdeAccion({ tipo: 'venta' }, null), null)
  })
})
