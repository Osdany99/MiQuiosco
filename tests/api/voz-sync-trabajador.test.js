import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { login, nombreUnico, post, raw } from './cliente.js'
import { actualizarPermisosPuesto, crearPuesto, crearUsuarioEnPuesto, filas } from './db-directa.js'
import { CLIENTE_SIN_CLIENTE_NOMBRE, CLIENTE_SIN_CLIENTE_NOTAS } from '../../shared/constants.ts'

let puestoId
let tokenJefe
let tokenTrabajador
let trabajadorId
let productoId
let loteId
let clienteId
let cuadreAjenoId

before(async () => {
  puestoId = await crearPuesto(nombreUnico('puesto_sync_worker'))
  const sufijo = nombreUnico('sync')
  await crearUsuarioEnPuesto(puestoId, `jefe_${sufijo}`, 'jefe', '1234')
  const worker = await crearUsuarioEnPuesto(puestoId, `worker_${sufijo}`, 'trabajador', '1234')
  trabajadorId = worker.id
  const jefe = await login(`jefe_${sufijo}`, '1234')
  const trabajador = await login(`worker_${sufijo}`, '1234')
  tokenJefe = jefe.body.token
  tokenTrabajador = trabajador.body.token

  const producto = await post('/api/productos', {
    nombre: nombreUnico('prod_sync_worker'), precioVentaActual: 10
  }, { token: tokenJefe, status: 200 })
  productoId = producto.id
  await post('/api/inventario/entradas', {
    fechaEntrada: '2026-05-01',
    lineas: [{ productoId, cantidad: 20, precioUnitario: 4 }]
  }, { token: tokenJefe, status: 200 })
  loteId = (await filas('lotes', `producto_id = '${productoId}'`))[0].id
  const cliente = await post('/api/clientes', {
    nombre: nombreUnico('cliente_sync_worker')
  }, { token: tokenJefe, status: 200 })
  clienteId = cliente.id

  const otroPuesto = await crearPuesto(nombreUnico('puesto_sync_ajeno'))
  const nombreJefeAjeno = `jefe_${nombreUnico('ajeno')}`
  await crearUsuarioEnPuesto(otroPuesto, nombreJefeAjeno, 'jefe', '1234')
  const ajeno = await login(nombreJefeAjeno, '1234')
  const cuadre = await post('/api/cuadres', { fecha: '2026-05-03' }, {
    token: ajeno.body.token, status: 200
  })
  cuadreAjenoId = cuadre.id
})

afterEach(async () => {
  await actualizarPermisosPuesto(puestoId, {})
})

let cuadreSeq = 0
async function cuadreNuevo() {
  cuadreSeq += 1
  return post('/api/cuadres', {
    fecha: `2026-08-${String(cuadreSeq).padStart(2, '0')}`
  }, { token: tokenJefe, status: 200 })
}

function deudaDinero(cuadreId, montoTotal = 40) {
  return {
    id: randomUUID(), puestoId, clienteId, cuadreOrigenId: cuadreId,
    montoTotal, montoPagado: 0, costoTotal: 777, ganancia: 777,
    estado: 'pendiente', creadoEn: Date.now(), actualizadoEn: Date.now()
  }
}

function transferencia(cuadreId, montoTotal = 20) {
  return {
    id: randomUUID(), puestoId, clienteId, cuadreId, montoTotal,
    creadoEn: Date.now(), actualizadoEn: Date.now()
  }
}

function fiadoDirecto() {
  const cuentaId = randomUUID()
  const itemId = randomUUID()
  const movimientoId = randomUUID()
  const ahora = Date.now()
  const cuenta = {
    id: cuentaId, puestoId, clienteId, cuadreOrigenId: null,
    montoTotal: 20, montoPagado: 0, costoTotal: 999, ganancia: 999,
    estado: 'pendiente', creadoEn: ahora, actualizadoEn: ahora
  }
  const item = {
    id: itemId, cuentaFiadoId: cuentaId, productoId,
    cantidad: 2, precioVentaUsado: 10, subtotal: 20, creadoEn: ahora
  }
  const movimiento = {
    id: movimientoId, puestoId, productoId, loteId,
    cuadreId: null, lineaCuadreId: null, traspasoId: null,
    ventaDirectaId: null, ventaDirectaItemId: null, cuentaFiadoItemId: itemId,
    tipo: 'venta', cantidad: 2, deltaAlmacen: -2, deltaQuiosco: 0,
    precioUnitario: 4, importe: 8, motivo: 'deuda_directa_almacen',
    nota: null, usuarioId: trabajadorId, anulado: false,
    creadoEn: ahora, actualizadoEn: ahora
  }
  return {
    cuentas_fiado: [cuenta], cuentas_fiado_items: [item],
    movimientos_inventario: [movimiento], deletes: []
  }
}

function pushTrabajador(body) {
  return raw('POST', '/api/sync/push', { body, token: tokenTrabajador })
}

describe('sync trabajador: fiado directo completo e idempotente', () => {
  it('recalcula costos, conserva IDs y no repite stock ni expone filas en el replay', async () => {
    const payload = fiadoDirecto()
    const cuentaId = payload.cuentas_fiado[0].id
    const movimientoId = payload.movimientos_inventario[0].id

    const r = await pushTrabajador(payload)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.ok(r.body.aceptados.includes(cuentaId))
    assert.ok(r.body.aceptados.includes(movimientoId))
    assert.deepEqual(r.body.conflictos, {})
    assert.deepEqual(r.body.deletesAceptados, [])

    const cuenta = (await filas('cuentas_fiado', `id = '${cuentaId}'`))[0]
    assert.equal(Number(cuenta.monto_total), 20)
    assert.equal(Number(cuenta.costo_total), 8)
    assert.equal(Number(cuenta.ganancia), 12)
    assert.equal((await filas('movimientos_inventario', `id = '${movimientoId}'`))[0].usuario_id, trabajadorId)

    const replay = await pushTrabajador({
      ...payload,
      usuarios: [{ id: randomUUID(), nombre: 'admin_indebido', rol: 'super_admin', pinHash: 'x' }],
      pagos_fiado: [{ id: randomUUID(), cuentaFiadoId: cuentaId, monto: 20, formaPago: 'efectivo' }],
      deletes: [{ tabla: 'usuarios', id: trabajadorId }]
    })
    assert.equal(replay.status, 200, JSON.stringify(replay.body))
    assert.deepEqual(replay.body.conflictos, {})
    assert.equal(JSON.stringify(replay.body).includes('costoTotal'), false)
    assert.equal((await filas('movimientos_inventario', `cuenta_fiado_item_id = '${payload.cuentas_fiado_items[0].id}'`)).length, 1)
    assert.equal((await filas('pagos_fiado', `cuenta_fiado_id = '${cuentaId}'`)).length, 0)
    assert.equal((await filas('usuarios', `nombre = 'admin_indebido'`)).length, 0)
    assert.equal((await filas('usuarios', `id = '${trabajadorId}'`)).length, 1)
  })

  it('el mismo ID con otro efecto devuelve 409 sin tocar la operación original', async () => {
    const payload = fiadoDirecto()
    assert.equal((await pushTrabajador(payload)).status, 200)
    payload.cuentas_fiado[0].montoTotal = 200
    const r = await pushTrabajador(payload)
    assert.equal(r.status, 409)
    assert.equal(Number((await filas('cuentas_fiado', `id = '${payload.cuentas_fiado[0].id}'`))[0].monto_total), 20)
  })
})

describe('sync trabajador: deuda, transferencia y cuadre', () => {
  it('calcula solo deltas nuevos e ignora los demás campos del cuadre', async () => {
    const cuadre = await cuadreNuevo()
    const deuda = deudaDinero(cuadre.id)
    const transf = transferencia(cuadre.id)
    const payload = {
      cuadres: [{
        id: cuadre.id, puestoId, estado: 'cerrado', montoFiado: 9999,
        montoTransferencia: 9999, costoTotal: 9999, ganancia: 9999,
        pagoTrabajador: 9999, totalRealCaja: 9999
      }],
      cuentas_fiado: [deuda], transferencias: [transf], deletes: []
    }
    const r = await pushTrabajador(payload)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.ok(r.body.aceptados.includes(cuadre.id))

    const actual = (await filas('cuadres', `id = '${cuadre.id}'`))[0]
    assert.equal(actual.estado, 'abierto')
    assert.equal(Number(actual.monto_fiado), 40)
    assert.equal(Number(actual.monto_transferencia), 20)
    assert.equal(actual.costo_total, null)
    assert.equal(actual.pago_trabajador, null)
    const deudaBd = (await filas('cuentas_fiado', `id = '${deuda.id}'`))[0]
    assert.equal(deudaBd.costo_total, null)
    assert.equal(deudaBd.ganancia, null)

    assert.equal((await pushTrabajador(payload)).status, 200)
    const trasReplay = (await filas('cuadres', `id = '${cuadre.id}'`))[0]
    assert.equal(Number(trasReplay.monto_fiado), 40)
    assert.equal(Number(trasReplay.monto_transferencia), 20)
  })

  it('rechaza cuadres cerrados o ajenos sin efectos parciales', async () => {
    const cerrado = await cuadreNuevo()
    await raw('POST', `/api/cuadres/${cerrado.id}/cerrar`, {
      body: { totalEsperado: 0, totalRealCaja: 0, lineas: [] }, token: tokenJefe
    })
    const deuda = deudaDinero(cerrado.id)
    const r1 = await pushTrabajador({ cuentas_fiado: [deuda], deletes: [] })
    assert.equal(r1.status, 409)
    assert.equal((await filas('cuentas_fiado', `id = '${deuda.id}'`)).length, 0)

    const transf = transferencia(cuadreAjenoId)
    const r2 = await pushTrabajador({ transferencias: [transf], deletes: [] })
    assert.equal(r2.status, 403)
    assert.equal((await filas('transferencias', `id = '${transf.id}'`)).length, 0)
  })
})

describe('sync trabajador: permisos y contención', () => {
  it('solo permite crear el centinela, nunca un cliente arbitrario', async () => {
    const centinela = {
      id: randomUUID(), puestoId, nombre: CLIENTE_SIN_CLIENTE_NOMBRE,
      notas: CLIENTE_SIN_CLIENTE_NOTAS, activo: true, esCentinela: true
    }
    assert.equal((await pushTrabajador({ clientes: [centinela], deletes: [] })).status, 200)
    assert.equal((await filas('clientes', `id = '${centinela.id}'`))[0].es_centinela, true)

    const arbitrario = { id: randomUUID(), puestoId, nombre: 'Cliente prohibido', activo: true }
    const r = await pushTrabajador({ clientes: [arbitrario], deletes: [] })
    assert.equal(r.status, 403)
    assert.equal((await filas('clientes', `id = '${arbitrario.id}'`)).length, 0)
  })

  it('una deuda con cobro o estado cambiado se rechaza; otras tablas y deletes se ignoran', async () => {
    const cuadre = await cuadreNuevo()
    const deuda = { ...deudaDinero(cuadre.id), montoPagado: 1, estado: 'parcial' }
    const r = await pushTrabajador({ cuentas_fiado: [deuda], deletes: [] })
    assert.equal(r.status, 403)
    assert.equal((await filas('cuentas_fiado', `id = '${deuda.id}'`)).length, 0)

    const vacio = await pushTrabajador({
      productos: [{ id: randomUUID(), puestoId, nombre: 'Producto indebido' }],
      pagos_fiado: [{ id: randomUUID(), cuentaFiadoId: randomUUID(), monto: 5 }],
      deletes: [{ tabla: 'productos', id: productoId }]
    })
    assert.equal(vacio.status, 200)
    assert.deepEqual(vacio.body.aceptados, [])
    assert.equal((await filas('productos', `id = '${productoId}'`)).length, 1)
    assert.equal((await filas('productos', `nombre = 'Producto indebido'`)).length, 0)
  })

  it('apagar fiar bloquea deuda y fiado, pero no una transferencia autorizada', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.cuadre.fiar': false })
    assert.equal((await pushTrabajador(fiadoDirecto())).status, 403)
    const cuadre = await cuadreNuevo()
    assert.equal((await pushTrabajador({ cuentas_fiado: [deudaDinero(cuadre.id)], deletes: [] })).status, 403)
    const transf = transferencia(cuadre.id)
    assert.equal((await pushTrabajador({ transferencias: [transf], deletes: [] })).status, 200)
  })

  it('apagar transferencia no bloquea una deuda autorizada', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.cuadre.transferencia': false })
    const cuadre = await cuadreNuevo()
    assert.equal((await pushTrabajador({ transferencias: [transferencia(cuadre.id)], deletes: [] })).status, 403)
    const deuda = deudaDinero(cuadre.id)
    assert.equal((await pushTrabajador({ cuentas_fiado: [deuda], deletes: [] })).status, 200)
  })

  it('la ubicación desactivada bloquea el fiado con inventario', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.almacen.voz': false })
    const payload = fiadoDirecto()
    const r = await pushTrabajador(payload)
    assert.equal(r.status, 403)
    assert.equal((await filas('cuentas_fiado', `id = '${payload.cuentas_fiado[0].id}'`)).length, 0)
  })
})
