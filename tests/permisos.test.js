import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as P from '../shared/permisos.js'

describe('permisos', () => {
  it('defaults: todo permitido salvo proveedores', () => {
    const ov = {}
    assert.equal(P.resolverClave('vistas.cuadre', ov), true)
    assert.equal(P.resolverClave('vistas.proveedores', ov), false)
    assert.equal(P.resolverClave('venta.familiar', ov), true)
  })

  it('apagar vista apaga sus acciones', () => {
    const ov = { 'vistas.recargas': false }
    assert.equal(P.resolverClave('vistas.recargas', ov), false)
    assert.equal(P.resolverClave('acciones.recargas.cobrar', ov), false)
  })

  it('apagar acción no apaga la vista', () => {
    const ov = { 'acciones.almacen.vender': false }
    assert.equal(P.resolverClave('vistas.almacen', ov), true)
    assert.equal(P.resolverClave('acciones.almacen.vender', ov), false)
    assert.equal(P.resolverClave('acciones.almacen.entrada', ov), true)
  })

  it('sparse overrides only diffs', () => {
    const estado = P.estadoCompleto({ 'acciones.almacen.vender': false })
    const ov = P.estadoAOverrides(estado)
    assert.deepEqual(ov, { 'acciones.almacen.vender': false })
  })

  it('normalizarOverrides descarta desconocidas', () => {
    const out = P.normalizarOverrides({ 'vistas.foo': true, 'vistas.recargas': false, 'x': true })
    assert.deepEqual(out, { 'vistas.recargas': false })
  })

  it('vistaDeRuta mapea rutas', () => {
    assert.equal(P.vistaDeRuta('/quiosco'), 'quiosco')
    assert.equal(P.vistaDeRuta('/inventario'), 'almacen')
    assert.equal(P.vistaDeRuta('/recargas/sms'), 'recargas-sms')
  })
})
