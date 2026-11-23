import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { login, nombreUnico, post, raw } from './cliente.js'
import { crearPuesto, crearUsuarioEnPuesto, filas } from './db-directa.js'

let puestoId
let tokenJefe
let tokenTrabajador
let jefeId
let trabajadorId
let clienteId
let cuadreSeq = 0

before(async () => {
  puestoId = await crearPuesto(nombreUnico('puesto_stock_race'))
  const sufijo = nombreUnico('race')
  const usuarioJefe = await crearUsuarioEnPuesto(puestoId, `jefe_${sufijo}`, 'jefe', '1234')
  jefeId = usuarioJefe.id
  const worker = await crearUsuarioEnPuesto(puestoId, `worker_${sufijo}`, 'trabajador', '1234')
  trabajadorId = worker.id
  const jefe = await login(`jefe_${sufijo}`, '1234')
  const trabajador = await login(`worker_${sufijo}`, '1234')
  tokenJefe = jefe.body.token
  tokenTrabajador = trabajador.body.token
  const cliente = await post('/api/clientes', { nombre: nombreUnico('cliente_race') }, {
    token: tokenJefe, status: 200
  })
  clienteId = cliente.id
})

async function productoConStock(stock = 1) {
  const producto = await post('/api/productos', {
    nombre: nombreUnico('prod_race'), precioVentaActual: 10
  }, { token: tokenJefe, status: 200 })
  await post('/api/inventario/entradas', {
    fechaEntrada: '2026-05-01',
    lineas: [{ productoId: producto.id, cantidad: stock, precioUnitario: 4 }]
  }, { token: tokenJefe, status: 200 })
  const lote = (await filas('lotes', `producto_id = '${producto.id}'`))[0]
  return { productoId: producto.id, loteId: lote.id }
}

function venta(productoId, id = randomUUID()) {
  return {
    id, ubicacion: 'almacen', tipoVenta: 'directa', clienteId: null,
    lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }]
  }
}

function deuda(productoId, id = randomUUID()) {
  return {
    id, clienteId, ubicacion: 'almacen', montoPagadoInicial: 0,
    lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }]
  }
}

async function saldo(productoId, campo = 'delta_almacen') {
  const movimientos = await filas('movimientos_inventario', `producto_id = '${productoId}' AND anulado = false`)
  return movimientos.reduce((total, mov) => total + Number(mov[campo]), 0)
}

async function cuadreConUnaVenta(productoId) {
  await post('/api/inventario/traspasos', {
    fecha: '2026-05-02', lineas: [{ productoId, cantidad: 1 }]
  }, { token: tokenJefe, status: 200 })
  cuadreSeq += 1
  const cuadre = await post('/api/cuadres', {
    fecha: `2026-09-${String(cuadreSeq).padStart(2, '0')}`
  }, { token: tokenJefe, status: 200 })
  const body = {
    totalEsperado: 10, totalRealCaja: 10,
    lineas: [{
      id: randomUUID(), productoId, precioVentaUsado: 10,
      cantidad: 1, subtotal: 10, secuencia: 0
    }]
  }
  return { cuadre, body }
}

function ventaOffline(productoId, loteId) {
  const ventaId = randomUUID()
  const itemId = randomUUID()
  const ahora = Date.now()
  return {
    ventas_directas: [{
      id: ventaId, puestoId, ubicacionVenta: 'almacen', tipoVenta: 'directa',
      clienteId: null, montoTotal: 10, costoTotal: 4, ganancia: 6,
      usuarioId: jefeId, anulado: false, creadoEn: ahora, actualizadoEn: ahora
    }],
    ventas_directas_items: [{
      id: itemId, ventaDirectaId: ventaId, productoId,
      cantidad: 1, precioVentaUsado: 10, subtotal: 10,
      costoUnitario: 4, costoTotal: 4, secuencia: 0, creadoEn: ahora
    }],
    movimientos_inventario: [{
      id: randomUUID(), puestoId, productoId, loteId,
      ventaDirectaId: ventaId, ventaDirectaItemId: itemId,
      tipo: 'venta', cantidad: 1, deltaAlmacen: -1, deltaQuiosco: 0,
      precioUnitario: 4, importe: 4, motivo: 'venta_directa_almacen',
      usuarioId: jefeId, anulado: false, creadoEn: ahora, actualizadoEn: ahora
    }],
    deletes: []
  }
}

function fiadoOffline(productoId, loteId) {
  const cuentaId = randomUUID()
  const itemId = randomUUID()
  const ahora = Date.now()
  return {
    cuentas_fiado: [{
      id: cuentaId, puestoId, clienteId, cuadreOrigenId: null,
      montoTotal: 10, montoPagado: 0, estado: 'pendiente',
      creadoEn: ahora, actualizadoEn: ahora
    }],
    cuentas_fiado_items: [{
      id: itemId, cuentaFiadoId: cuentaId, productoId,
      cantidad: 1, precioVentaUsado: 10, subtotal: 10, creadoEn: ahora
    }],
    movimientos_inventario: [{
      id: randomUUID(), puestoId, productoId, loteId,
      cuentaFiadoItemId: itemId, tipo: 'venta', cantidad: 1,
      deltaAlmacen: -1, deltaQuiosco: 0, precioUnitario: 4, importe: 4,
      motivo: 'deuda_directa_almacen', usuarioId: trabajadorId,
      anulado: false, creadoEn: ahora, actualizadoEn: ahora
    }],
    deletes: []
  }
}

describe('stock concurrente: ventas directas y fiado', () => {
  it('dos ventas por una unidad: una se aplica y la otra devuelve 409', async () => {
    const { productoId } = await productoConStock()
    const respuestas = await Promise.all([
      raw('POST', '/api/ventas-directas', { body: venta(productoId), token: tokenJefe }),
      raw('POST', '/api/ventas-directas', { body: venta(productoId), token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal(await saldo(productoId), 0)
    assert.equal((await filas('ventas_directas', `puesto_id = '${puestoId}'`)).length, 1)
    assert.equal((await filas('movimientos_inventario', `producto_id = '${productoId}' AND tipo = 'venta'`)).length, 1)
  })

  it('venta contra deuda directa tampoco duplica la última unidad', async () => {
    const { productoId } = await productoConStock()
    const ventaId = randomUUID()
    const deudaId = randomUUID()
    const respuestas = await Promise.all([
      raw('POST', '/api/ventas-directas', { body: venta(productoId, ventaId), token: tokenJefe }),
      raw('POST', '/api/cuentas-fiado/directas', { body: deuda(productoId, deudaId), token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal(await saldo(productoId), 0)
    const ventas = await filas('ventas_directas', `id = '${ventaId}'`)
    const cuentas = await filas('cuentas_fiado', `id = '${deudaId}'`)
    assert.equal(ventas.length + cuentas.length, 1)
    assert.equal((await filas('movimientos_inventario', `producto_id = '${productoId}' AND tipo = 'venta'`)).length, 1)
  })

  it('el mismo ID de venta en paralelo devuelve el mismo recibo sin doble salida', async () => {
    const { productoId } = await productoConStock()
    const id = randomUUID()
    const respuestas = await Promise.all([
      raw('POST', '/api/ventas-directas', { body: venta(productoId, id), token: tokenJefe }),
      raw('POST', '/api/ventas-directas', { body: venta(productoId, id), token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status), [200, 200])
    assert.ok(respuestas.every(r => r.body.id === id))
    assert.ok(respuestas.some(r => r.body.idempotente === true))
    assert.equal((await filas('ventas_directas', `id = '${id}'`)).length, 1)
    assert.equal((await filas('movimientos_inventario', `venta_directa_id = '${id}'`)).length, 1)
    assert.equal(await saldo(productoId), 0)
  })

  it('el mismo ID de deuda en paralelo también reconcilia sin repetir FIFO', async () => {
    const { productoId } = await productoConStock()
    const id = randomUUID()
    const respuestas = await Promise.all([
      raw('POST', '/api/cuentas-fiado/directas', { body: deuda(productoId, id), token: tokenJefe }),
      raw('POST', '/api/cuentas-fiado/directas', { body: deuda(productoId, id), token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status), [200, 200])
    assert.ok(respuestas.every(r => r.body.id === id))
    assert.ok(respuestas.some(r => r.body.idempotente === true))
    assert.equal((await filas('cuentas_fiado', `id = '${id}'`)).length, 1)
    const items = await filas('cuentas_fiado_items', `cuenta_fiado_id = '${id}'`)
    assert.equal(items.length, 1)
    assert.equal((await filas('movimientos_inventario', `cuenta_fiado_item_id = '${items[0].id}'`)).length, 1)
    assert.equal(await saldo(productoId), 0)
  })

  it('un ID de venta con otra cantidad no se acepta como replay', async () => {
    const { productoId } = await productoConStock(3)
    const id = randomUUID()
    await raw('POST', '/api/ventas-directas', { body: venta(productoId, id), token: tokenJefe, status: 200 })
    const cambiado = {
      ...venta(productoId, id),
      lineas: [{ productoId, cantidad: 2, precioVentaUsado: 10 }]
    }
    const replay = await raw('POST', '/api/ventas-directas', { body: cambiado, token: tokenJefe })
    assert.equal(replay.status, 409)
    assert.equal((await filas('movimientos_inventario', `venta_directa_id = '${id}'`)).length, 1)
    assert.equal(Number((await filas('ventas_directas', `id = '${id}'`))[0].monto_total), 10)
  })

  it('un ID de deuda con otro producto o ubicación devuelve 409 aunque el total coincida', async () => {
    const primero = await productoConStock()
    const segundo = await productoConStock()
    const id = randomUUID()
    await raw('POST', '/api/cuentas-fiado/directas', {
      body: deuda(primero.productoId, id), token: tokenJefe, status: 200
    })
    const otroProducto = await raw('POST', '/api/cuentas-fiado/directas', {
      body: deuda(segundo.productoId, id), token: tokenJefe
    })
    assert.equal(otroProducto.status, 409)
    const otraUbicacion = await raw('POST', '/api/cuentas-fiado/directas', {
      body: { ...deuda(primero.productoId, id), ubicacion: 'quiosco' }, token: tokenJefe
    })
    assert.equal(otraUbicacion.status, 409)
    const items = await filas('cuentas_fiado_items', `cuenta_fiado_id = '${id}'`)
    assert.equal(items.length, 1)
    assert.equal((await filas('movimientos_inventario', `cuenta_fiado_item_id = '${items[0].id}'`)).length, 1)
  })

  it('un ID de deuda con abono inicial no acepta el replay convertido a cero', async () => {
    const { productoId } = await productoConStock()
    const id = randomUUID()
    const original = { ...deuda(productoId, id), montoPagadoInicial: 5, formaPagoInicial: 'efectivo' }
    await raw('POST', '/api/cuentas-fiado/directas', { body: original, token: tokenJefe, status: 200 })
    const identico = await raw('POST', '/api/cuentas-fiado/directas', { body: original, token: tokenJefe })
    assert.equal(identico.status, 200)
    assert.equal(identico.body.idempotente, true)

    const sinAbono = await raw('POST', '/api/cuentas-fiado/directas', {
      body: { ...original, montoPagadoInicial: 0 }, token: tokenJefe
    })
    assert.equal(sinAbono.status, 409)
    assert.equal(Number((await filas('cuentas_fiado', `id = '${id}'`))[0].monto_pagado), 5)
    assert.equal((await filas('pagos_fiado', `cuenta_fiado_id = '${id}'`)).length, 1)
  })

  it('el replay idéntico de deuda conserva secuencia aunque no sea una columna persistida', async () => {
    const { productoId } = await productoConStock()
    const id = randomUUID()
    const original = {
      ...deuda(productoId, id),
      lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10, secuencia: 1 }]
    }
    await raw('POST', '/api/cuentas-fiado/directas', { body: original, token: tokenJefe, status: 200 })
    const replay = await raw('POST', '/api/cuentas-fiado/directas', { body: original, token: tokenJefe })
    assert.equal(replay.status, 200, JSON.stringify(replay.body))
    assert.equal(replay.body.idempotente, true)
    assert.equal((await filas('cuentas_fiado_items', `cuenta_fiado_id = '${id}'`)).length, 1)
  })
})

describe('stock concurrente: cierre, reapertura y sync', () => {
  it('dos cierres del mismo cuadre producen un solo consumo', async () => {
    const { productoId } = await productoConStock()
    const { cuadre, body } = await cuadreConUnaVenta(productoId)
    const respuestas = await Promise.all([
      raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, { body, token: tokenJefe }),
      raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, { body, token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal((await filas('movimientos_inventario', `cuadre_id = '${cuadre.id}' AND tipo = 'venta'`)).length, 1)
    assert.equal(await saldo(productoId, 'delta_quiosco'), 0)
  })

  it('dos reaperturas no devuelven dos veces la mercancía', async () => {
    const { productoId } = await productoConStock()
    const { cuadre, body } = await cuadreConUnaVenta(productoId)
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, { body, token: tokenJefe, status: 200 })
    const respuestas = await Promise.all([
      raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token: tokenJefe }),
      raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal((await filas('movimientos_inventario', `cuadre_id = '${cuadre.id}' AND tipo = 'anulacion'`)).length, 1)
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].reabierto_veces), 1)
    assert.equal(await saldo(productoId, 'delta_quiosco'), 1)
  })

  it('dos pushes crudos: el perdedor devuelve 409 y no baja de cero', async () => {
    const { productoId, loteId } = await productoConStock()
    const movimiento = () => ({
      id: randomUUID(), puestoId, productoId, loteId, tipo: 'venta', cantidad: 1,
      deltaAlmacen: -1, deltaQuiosco: 0, precioUnitario: 4, importe: 4,
      anulado: false, creadoEn: Date.now(), actualizadoEn: Date.now()
    })
    const respuestas = await Promise.all([
      raw('POST', '/api/sync/push', { body: { movimientos_inventario: [movimiento()] }, token: tokenJefe }),
      raw('POST', '/api/sync/push', { body: { movimientos_inventario: [movimiento()] }, token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    const ganador = respuestas.find(r => r.status === 200)
    assert.equal(ganador.body.aceptados.length, 1)
    assert.equal(await saldo(productoId), 0)
  })

  it('un push con cabecera + items + FIFO revierte la venta completa perdedora', async () => {
    const { productoId, loteId } = await productoConStock()
    const primero = ventaOffline(productoId, loteId)
    const segundo = ventaOffline(productoId, loteId)
    const ids = [primero.ventas_directas[0].id, segundo.ventas_directas[0].id]
    const respuestas = await Promise.all([
      raw('POST', '/api/sync/push', { body: primero, token: tokenJefe }),
      raw('POST', '/api/sync/push', { body: segundo, token: tokenJefe })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal((await filas('ventas_directas', `id IN ('${ids[0]}', '${ids[1]}')`)).length, 1)
    assert.equal((await filas('ventas_directas_items', `producto_id = '${productoId}'`)).length, 1)
    assert.equal((await filas('movimientos_inventario', `producto_id = '${productoId}' AND tipo = 'venta'`)).length, 1)
    assert.equal(await saldo(productoId), 0)
  })

  it('el push selectivo del trabajador revierte toda la deuda perdedora', async () => {
    const { productoId, loteId } = await productoConStock()
    const primero = fiadoOffline(productoId, loteId)
    const segundo = fiadoOffline(productoId, loteId)
    const ids = [primero.cuentas_fiado[0].id, segundo.cuentas_fiado[0].id]
    const respuestas = await Promise.all([
      raw('POST', '/api/sync/push', { body: primero, token: tokenTrabajador }),
      raw('POST', '/api/sync/push', { body: segundo, token: tokenTrabajador })
    ])
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409])
    assert.equal((await filas('cuentas_fiado', `id IN ('${ids[0]}', '${ids[1]}')`)).length, 1)
    assert.equal((await filas('cuentas_fiado_items', `producto_id = '${productoId}'`)).length, 1)
    assert.equal((await filas('movimientos_inventario', `producto_id = '${productoId}' AND tipo = 'venta'`)).length, 1)
    assert.equal(await saldo(productoId), 0)
  })
})
