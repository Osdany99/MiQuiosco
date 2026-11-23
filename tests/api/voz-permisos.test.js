import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { login, nombreUnico, post, raw } from './cliente.js'
import { actualizarPermisosPuesto, crearPuesto, crearUsuarioEnPuesto, filas } from './db-directa.js'
import { CLIENTE_SIN_CLIENTE_NOMBRE, CLIENTE_SIN_CLIENTE_NOTAS } from '../../shared/constants.ts'

let puestoId
let tokenJefe
let tokenTrabajador
let productoId
let cuadreId
let clienteId

before(async () => {
  puestoId = await crearPuesto(nombreUnico('puesto_voz_permisos'))
  const sufijo = nombreUnico('roles')
  await crearUsuarioEnPuesto(puestoId, `jefe_${sufijo}`, 'jefe', '1234')
  await crearUsuarioEnPuesto(puestoId, `worker_${sufijo}`, 'trabajador', '1234')

  const jefe = await login(`jefe_${sufijo}`, '1234')
  const trabajador = await login(`worker_${sufijo}`, '1234')
  assert.equal(jefe.status, 200)
  assert.equal(trabajador.status, 200)
  tokenJefe = jefe.body.token
  tokenTrabajador = trabajador.body.token

  const producto = await post('/api/productos', {
    nombre: nombreUnico('prod_voz_perm'), precioVentaActual: 10
  }, { token: tokenJefe, status: 200 })
  productoId = producto.id
  await post('/api/inventario/entradas', {
    fechaEntrada: '2026-05-01',
    lineas: [{ productoId, cantidad: 20, precioUnitario: 4 }]
  }, { token: tokenJefe, status: 200 })
  const cuadre = await post('/api/cuadres', { fecha: '2026-05-02' }, { token: tokenJefe, status: 200 })
  cuadreId = cuadre.id
  const cliente = await post('/api/clientes', { nombre: nombreUnico('cliente_voz') }, { token: tokenJefe, status: 200 })
  clienteId = cliente.id
})

afterEach(async () => {
  await actualizarPermisosPuesto(puestoId, {})
})

describe('voz API: lecturas mínimas del trabajador', () => {
  it('entrega catálogo, stock y cuadre abierto sin costos ni márgenes', async () => {
    const productos = await raw('GET', '/api/productos', { token: tokenTrabajador })
    assert.equal(productos.status, 200)
    assert.equal(productos.body[0].precioCompraActual, undefined)

    const saldos = await raw('GET', '/api/inventario/saldos', { token: tokenTrabajador })
    assert.equal(saldos.status, 200)
    assert.equal(saldos.body[0].costoActual, undefined)
    assert.equal(saldos.body[0].valorizadoAlmacen, undefined)
    assert.equal(saldos.body[0].valorizadoQuiosco, undefined)

    const cuadres = await raw('GET', '/api/cuadres', { token: tokenTrabajador })
    assert.equal(cuadres.status, 200)
    assert.ok(cuadres.body.every(c => c.estado === 'abierto'))
    assert.equal(cuadres.body[0].costoTotal, undefined)
    assert.equal(cuadres.body[0].ganancia, undefined)
    assert.equal(cuadres.body[0].totalRealCaja, undefined)

    const clientes = await raw('GET', '/api/clientes', { token: tokenTrabajador })
    assert.equal(clientes.status, 200)
  })

  it('permite reparar el centinela, pero no crear un cliente arbitrario', async () => {
    const prohibido = await raw('POST', '/api/clientes', {
      body: { nombre: nombreUnico('cliente_prohibido') },
      token: tokenTrabajador
    })
    assert.equal(prohibido.status, 403)

    const centinela = await raw('POST', '/api/clientes', {
      body: {
        nombre: CLIENTE_SIN_CLIENTE_NOMBRE,
        notas: CLIENTE_SIN_CLIENTE_NOTAS,
        activo: true,
        esCentinela: true
      },
      token: tokenTrabajador
    })
    assert.equal(centinela.status, 200)
    assert.equal(centinela.body.esCentinela, true)
  })
})

describe('voz API: escrituras financieras por rol y permiso', () => {
  it('fiado directo permitido no expone costo ni ganancia en el recibo', async () => {
    const r = await raw('POST', '/api/cuentas-fiado/directas', {
      body: {
        id: randomUUID(), clienteId, ubicacion: 'almacen',
        lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }],
        montoPagadoInicial: 0,
        formaPagoInicial: 'efectivo'
      },
      token: tokenTrabajador
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.montoTotal, 10)
    assert.equal(r.body.costoTotal, undefined)
    assert.equal(r.body.ganancia, undefined)
  })

  it('deuda de dinero y transferencia permitidas conservan su efecto', async () => {
    const deuda = await raw('POST', '/api/cuentas-fiado', {
      body: {
        id: randomUUID(), clienteId, cuadreOrigenId: cuadreId,
        items: [], montoTotal: 40, montoPagadoInicial: 0
      },
      token: tokenTrabajador
    })
    assert.equal(deuda.status, 200)
    assert.equal(deuda.body.montoTotal, 40)

    const transferencia = await raw('POST', '/api/transferencias', {
      body: { id: randomUUID(), clienteId, cuadreId, monto: 20 },
      token: tokenTrabajador
    })
    assert.equal(transferencia.status, 200)
    assert.equal(Number((await filas('cuadres', `id = '${cuadreId}'`))[0].monto_transferencia), 20)
  })

  it('trabajador no puede cobrar, vender directamente ni crear deuda con abono', async () => {
    const cuentas = await raw('GET', '/api/cuentas-fiado', { token: tokenTrabajador })
    const deuda = cuentas.body.find(c => Number(c.saldoPendiente) > 0)
    assert.ok(deuda)

    const cobro = await raw('POST', '/api/pagos-fiado', {
      body: { cuentaFiadoId: deuda.id, cuadreId: null, monto: 1, formaPago: 'efectivo' },
      token: tokenTrabajador
    })
    assert.equal(cobro.status, 403)

    const venta = await raw('POST', '/api/ventas-directas', {
      body: {
        ubicacion: 'almacen', tipoVenta: 'directa', clienteId,
        lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }]
      },
      token: tokenTrabajador
    })
    assert.equal(venta.status, 403)

    const abonoDirecto = await raw('POST', '/api/cuentas-fiado/directas', {
      body: {
        clienteId, ubicacion: 'almacen',
        lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }],
        montoPagadoInicial: 1,
        formaPagoInicial: 'efectivo'
      },
      token: tokenTrabajador
    })
    assert.equal(abonoDirecto.status, 403)

    const abonoCuadre = await raw('POST', '/api/cuentas-fiado', {
      body: {
        clienteId, cuadreOrigenId: cuadreId, items: [],
        montoTotal: 10, montoPagadoInicial: 1
      },
      token: tokenTrabajador
    })
    assert.equal(abonoCuadre.status, 403)
  })

  it('apagar la voz de la ubicación bloquea solo el fiado con inventario', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.almacen.voz': false })

    const fiado = await raw('POST', '/api/cuentas-fiado/directas', {
      body: {
        clienteId, ubicacion: 'almacen',
        lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }]
      },
      token: tokenTrabajador
    })
    assert.equal(fiado.status, 403)

    const deuda = await raw('POST', '/api/cuentas-fiado', {
      body: {
        id: randomUUID(), clienteId, cuadreOrigenId: cuadreId,
        items: [], montoTotal: 8, montoPagadoInicial: 0
      },
      token: tokenTrabajador
    })
    assert.equal(deuda.status, 200)
  })

  it('apagar fiar bloquea fiado y catálogo, sin bloquear transferencia', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.cuadre.fiar': false })

    const fiado = await raw('POST', '/api/cuentas-fiado/directas', {
      body: {
        clienteId, ubicacion: 'almacen',
        lineas: [{ productoId, cantidad: 1, precioVentaUsado: 10 }]
      },
      token: tokenTrabajador
    })
    assert.equal(fiado.status, 403)
    assert.equal((await raw('GET', '/api/productos', { token: tokenTrabajador })).status, 403)

    const transferencia = await raw('POST', '/api/transferencias', {
      body: { id: randomUUID(), clienteId, cuadreId, monto: 5 },
      token: tokenTrabajador
    })
    assert.equal(transferencia.status, 200)
  })

  it('apagar transferencia bloquea esa escritura, no el fiado', async () => {
    await actualizarPermisosPuesto(puestoId, { 'acciones.cuadre.transferencia': false })

    const transferencia = await raw('POST', '/api/transferencias', {
      body: { id: randomUUID(), clienteId, cuadreId, monto: 5 },
      token: tokenTrabajador
    })
    assert.equal(transferencia.status, 403)

    const deuda = await raw('POST', '/api/cuentas-fiado', {
      body: {
        id: randomUUID(), clienteId, cuadreOrigenId: cuadreId,
        items: [], montoTotal: 8, montoPagadoInicial: 0
      },
      token: tokenTrabajador
    })
    assert.equal(deuda.status, 200)
  })

  it('también al jefe se le aplica acciones.deudas.cobrar', async () => {
    const cuentas = await raw('GET', '/api/cuentas-fiado', { token: tokenJefe })
    const deuda = cuentas.body.find(c => Number(c.saldoPendiente) > 0)
    assert.ok(deuda)
    await actualizarPermisosPuesto(puestoId, { 'acciones.deudas.cobrar': false })

    const cobro = await raw('POST', '/api/pagos-fiado', {
      body: { cuentaFiadoId: deuda.id, cuadreId: null, monto: 1, formaPago: 'efectivo' },
      token: tokenJefe
    })
    assert.equal(cobro.status, 403)
  })

  it('rechaza cuadres inexistentes sin actualizar montos', async () => {
    const inexistente = randomUUID()
    const r = await raw('POST', '/api/transferencias', {
      body: { clienteId, cuadreId: inexistente, monto: 500 },
      token: tokenTrabajador
    })
    assert.equal(r.status, 404)
    assert.equal((await filas('transferencias', `cuadre_id = '${inexistente}'`)).length, 0)
  })
})
