import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ACCIONES_ACIERTO, detalleDeAccion } from '../app/utils/voice/detalleAcierto.js'
import { aciertosVozSchema } from '../shared/schemas/vozAciertos.js'
import {
  VOZ_RETENCION_ACIERTOS_DEFECTO,
  normalizarVozConfig
} from '../shared/voz/config.js'
import { vozConfigSchema } from '../shared/schemas/vozConfig.js'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('voz: aciertos — detalle de la acción', () => {
  it('resume producto, cantidad e importe', () => {
    const detalle = detalleDeAccion({
      tipo: 'venta',
      fila: { nombre: 'Pan de leche' },
      cantidad: 2,
      importe: 50
    })
    assert.equal(detalle, '2 × Pan de leche · importe: 50')
  })

  it('distingue tipo de venta no directa y nombre con descripción', () => {
    assert.equal(
      detalleDeAccion({
        tipo: 'venta',
        tipoVenta: 'familiar',
        fila: { nombre: 'Chupa chupa', descripcion: 'de fresa' },
        cantidad: 1,
        importe: 100
      }),
      'Chupa chupa de fresa · familiar · importe: 100'
    )
    assert.equal(
      detalleDeAccion({ tipo: 'venta', tipoVenta: 'casa', fila: { nombre: 'Arroz' }, importe: 0 }),
      'Arroz · casa · importe: 0'
    )
    assert.equal(
      detalleDeAccion({ tipo: 'venta', tipoVenta: 'regalo', fila: { nombre: 'Refresco' }, importe: 0 }),
      'Refresco · regalo · importe: 0'
    )
    assert.equal(
      detalleDeAccion({ tipo: 'venta', tipoVenta: 'directa', fila: { nombre: 'Pan' }, importe: 25 }),
      'Pan · importe: 25'
    )
  })

  it('incluye el cliente en fiado y cobro', () => {
    assert.equal(
      detalleDeAccion({
        tipo: 'fiar',
        fila: { nombre: 'Pan' },
        cantidad: 1,
        importe: 25,
        cliente: { nombre: 'Juan' }
      }),
      'Pan · cliente: Juan · importe: 25'
    )
    assert.equal(
      detalleDeAccion({ tipo: 'cobrar', cliente: { nombre: 'María' }, monto: 200 }),
      'cliente: María · importe: 200'
    )
  })

  it('describe la posición de mover en base 1', () => {
    assert.equal(
      detalleDeAccion({
        tipo: 'mover',
        fila: { nombre: 'Refresco' },
        referencia: { nombre: 'Pan' },
        indice: 2
      }),
      'Refresco · posición 3, tras Pan'
    )
  })

  it('incluye el motivo del ajuste', () => {
    assert.equal(
      detalleDeAccion({
        tipo: 'ajuste',
        fila: { nombre: 'Pan' },
        cantidad: 3,
        ajusteTipo: 'merma',
        motivo: 'rotos, se cayeron'
      }),
      '3 × Pan · merma · rotos, se cayeron'
    )
  })

  it('no inventa detalle y recorta a 200 caracteres', () => {
    assert.equal(detalleDeAccion(null), null)
    assert.equal(detalleDeAccion({ tipo: 'consultar_caja' }), null)
    const largo = detalleDeAccion({
      tipo: 'venta',
      fila: { nombre: 'x'.repeat(400) },
      cantidad: 1
    })
    assert.equal(largo.length, 200)
  })

  it('solo considera aciertos las acciones aplicables', () => {
    for (const tipo of ['error', 'aviso', 'ambiguo', 'stock', 'cancelado']) {
      assert.equal(ACCIONES_ACIERTO.has(tipo), false, tipo)
    }
    for (const tipo of ['venta', 'venta_multiple', 'fiar', 'consultar_stock', 'ajuste']) {
      assert.equal(ACCIONES_ACIERTO.has(tipo), true, tipo)
    }
  })
})

describe('voz: aciertos — payload y configuración', () => {
  it('acepta un lote válido y rechaza uuid o longitudes inválidas', () => {
    const valido = aciertosVozSchema.safeParse({
      aciertos: [{ id: UUID, comando: 'venta_directa', resultado: 'venta' }]
    })
    assert.equal(valido.success, true)

    assert.equal(aciertosVozSchema.safeParse({
      aciertos: [{ id: 'no-es-uuid', comando: 'venta_directa', resultado: 'venta' }]
    }).success, false)

    assert.equal(aciertosVozSchema.safeParse({
      aciertos: [{ id: UUID, comando: 'x'.repeat(51), resultado: 'venta' }]
    }).success, false)

    assert.equal(aciertosVozSchema.safeParse({
      aciertos: [{ id: UUID, comando: 'venta_directa', resultado: 'venta', texto: 'x'.repeat(301) }]
    }).success, false)
  })

  it('normaliza el switch y la retención de aciertos', () => {
    assert.equal(normalizarVozConfig({}).capturarAciertos, false)
    assert.equal(normalizarVozConfig({ capturarAciertos: true }).capturarAciertos, true)
    assert.equal(
      normalizarVozConfig({}).retencionAciertosDias,
      VOZ_RETENCION_ACIERTOS_DEFECTO
    )
    assert.equal(normalizarVozConfig({ retencionAciertosDias: 0 }).retencionAciertosDias, 1)
    assert.equal(normalizarVozConfig({ retencionAciertosDias: 500 }).retencionAciertosDias, 90)
    assert.equal(normalizarVozConfig({ retencionAciertosDias: 12 }).retencionAciertosDias, 12)
  })

  it('el esquema de flota acepta y valida los campos nuevos', () => {
    const base = {
      wake: 'oye nova',
      motor: 'auto',
      idioma: 'sistema',
      retencionDias: 30,
      capturarTexto: false,
      capturarAciertos: true,
      retencionAciertosDias: 7
    }
    assert.equal(vozConfigSchema.safeParse(base).success, true)
    assert.equal(vozConfigSchema.safeParse({ ...base, retencionAciertosDias: 0 }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, retencionAciertosDias: 91 }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, capturarAciertos: 'sí' }).success, false)
  })
})
