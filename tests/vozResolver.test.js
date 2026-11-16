import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolverVenta } from '../app/utils/voice/resolverVenta.js'
import { formatearImporte } from '../app/utils/voice/frasesVoz.js'

const CATALOGO = [
  { productoId: 'p1', nombre: 'Pan de leche', descripcion: '', quiosco: 5, almacen: 20, precioVentaActual: 10, seVende: true },
  { productoId: 'p2', nombre: 'Refresco Cola', descripcion: '', quiosco: 3, almacen: 10, precioVentaActual: 25, seVende: true },
  { productoId: 'p3', nombre: 'Pan Blanco', descripcion: '', quiosco: 4, almacen: 8, precioVentaActual: 12, seVende: true }
]

function slots(extra = {}) {
  return { productoHint: 'pan de leche', cantidad: 2, tipoVenta: 'directa', ...extra }
}

describe('voz: resolución de venta (pura)', () => {
  it('resuelve una venta directa con importe', () => {
    const accion = resolverVenta({
      slots: slots(),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'venta')
    assert.equal(accion.modo, 'directa')
    assert.equal(accion.cantidad, 2)
    assert.equal(accion.precioUnitario, 10)
    assert.equal(accion.importe, 20)
    assert.equal(accion.destino.ubicacion, 'quiosco')
    assert.equal(accion.fila.productoId, 'p1')
  })

  it('respeta el precio dictado por encima del catálogo', () => {
    const accion = resolverVenta({
      slots: slots({ precioUnitario: 12.5 }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.precioUnitario, 12.5)
    assert.equal(accion.importe, 25)
  })

  it('sin venta directa devuelve el modo formulario', () => {
    const accion = resolverVenta({
      slots: slots(),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: false
    })
    assert.equal(accion.tipo, 'venta')
    assert.equal(accion.modo, 'formulario')
  })

  it('detecta stock insuficiente con el mensaje hablado', () => {
    const accion = resolverVenta({
      slots: slots({ cantidad: 9 }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'stock')
    assert.equal(accion.disponible, 5)
    assert.match(accion.mensaje, /5 unidades/)
  })

  it('no vende si dos productos empatan', () => {
    const accion = resolverVenta({
      slots: slots({ productoHint: 'pan' }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'ambiguo')
    assert.ok(accion.candidatos.length >= 2)
  })

  it('una confianza baja convierte el match en ambigüedad', () => {
    const accion = resolverVenta({
      slots: slots({ productoHint: 'pan' }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.01,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'ambiguo')
  })

  it('avisa del conflicto de ubicación dentro de inventario', () => {
    const accion = resolverVenta({
      slots: slots({ ubicacion: 'almacen' }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      permitirConflicto: true,
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'aviso')
    assert.equal(accion.motivo, 'ubicacion_conflicto')
    assert.match(accion.mensaje, /Almacén/)
  })

  it('fuera de inventario respeta la ubicación dictada', () => {
    const accion = resolverVenta({
      slots: slots({ ubicacion: 'almacen' }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      permitirConflicto: false,
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'venta')
    assert.equal(accion.destino.ubicacion, 'almacen')
    assert.equal(accion.disponible, 20)
  })

  it('informa cuando el producto no existe', () => {
    const accion = resolverVenta({
      slots: slots({ productoHint: 'zzzz' }),
      catalogo: CATALOGO,
      ubicacionVista: 'quiosco',
      sttConfidence: 0.95,
      ventaDirecta: true
    })
    assert.equal(accion.tipo, 'error')
    assert.equal(accion.motivo, 'producto_no_encontrado')
  })

  it('formatea el importe para el TTS', () => {
    assert.equal(formatearImporte(20), '20')
    assert.equal(formatearImporte(12.5), '12,50')
    assert.equal(formatearImporte(0), null)
    assert.equal(formatearImporte(null), null)
  })
})
