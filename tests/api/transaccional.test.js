/**
 * Endpoints transaccionales (Fase 2.7): cuadres, fiado, pagos, transferencias,
 * ajustes, inventario, ventas directas, recargas, clientes, productos.
 *
 * Flujos reales via API (entradas -> traspasos -> cuadre -> cerrar) con
 * verificacion SQL del estado resultante: FIFO, acumulados con piso 0,
 * atomicidad de faltantes, guards de estado y validaciones.
 *
 * Paralelo-seguro: fixtures con nombres/fechas/telefonos unicos por test.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  tokenJefe, get, post, raw, mensajeDe, nombreUnico
} from './cliente.js'
import { filas } from './db-directa.js'

let token

// UUID v4 valido que no existe en la BD. OJO: no usar '00000000-...-0099':
// Zod valida version/variante del UUID y lo rechaza con 400 antes de llegar
// al 404 del endpoint.
const ID_INEXISTENTE = '123e4567-e89b-42d3-a456-426614174099'

before(async () => {
  token = await tokenJefe()
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion')
})

/**
 * Fecha unica y SIEMPRE valida para el unique (puesto_id, fecha) de cuadres.
 * (La version anterior generaba 2026-06-31/32 y Postgres devolvia 500.)
 */
let diaSeq = 0
function fechaUnica() {
  diaSeq += 1
  const mes = String(1 + (Math.floor(diaSeq / 28) % 12)).padStart(2, '0')
  const dia = String(1 + (diaSeq % 28)).padStart(2, '0')
  return `2026-${mes}-${dia}`
}

let telSeq = 100
function telefonoUnico() {
  telSeq += 1
  return `53${String(62000000 + telSeq)}`
}

/**
 * Tienda minima: producto + compra + traspaso al quiosco.
 * `alQuiosco` (default = todo) deja el resto en el almacen, para probar ventas
 * desde ambas ubicaciones. Devuelve { productoId, precioCompra, precioVenta }.
 */
async function montarTienda(prefijo, { stock = 10, compra = 5, venta = 10, alQuiosco = null } = {}) {
  const producto = await post('/api/productos', {
    nombre: nombreUnico(`${prefijo}_prod`), precioVentaActual: venta
  }, { token, status: 200 })
  await post('/api/inventario/entradas', {
    fechaEntrada: '2026-05-01',
    lineas: [{ productoId: producto.id, cantidad: stock, precioUnitario: compra }]
  }, { token, status: 200 })
  const alQ = alQuiosco ?? stock
  if (alQ > 0) {
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-01',
      lineas: [{ productoId: producto.id, cantidad: alQ }]
    }, { token, status: 200 })
  }
  return { productoId: producto.id, precioCompra: compra, precioVenta: venta }
}

async function crearCuadre(fecha) {
  return post('/api/cuadres', { fecha: fecha ?? fechaUnica() }, { token, status: 200 })
}

async function crearCliente(prefijo) {
  return post('/api/clientes', { nombre: nombreUnico(`${prefijo}_cli`) }, { token, status: 200 })
}

describe('cuadres: alta y cierre con FIFO', () => {
  it('POST /api/cuadres crea abierto; duplicado (puesto,fecha) da 409', async () => {
    const fecha = fechaUnica()
    const c = await crearCuadre(fecha)
    assert.equal(c.estado, 'abierto')
    const dup = await raw('POST', '/api/cuadres', { body: { fecha }, token })
    assert.equal(dup.status, 409)
  })

  it('cerrar consume FIFO y congela costo/ganancia/diferencia', async () => {
    // Dos lotes: 10u @5 y 10u @7. Venta de 12u @10: costo 10*5+2*7=64.
    const p = await post('/api/productos', {
      nombre: nombreUnico('fifo_prod'), precioVentaActual: 10
    }, { token, status: 200 })
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-01',
      lineas: [{ productoId: p.id, cantidad: 10, precioUnitario: 5 }]
    }, { token, status: 200 })
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-02',
      lineas: [{ productoId: p.id, cantidad: 10, precioUnitario: 7 }]
    }, { token, status: 200 })
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-03',
      lineas: [{ productoId: p.id, cantidad: 20 }]
    }, { token, status: 200 })
    const cuadre = await crearCuadre()
    const lineaId = randomUUID()
    const r = await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 120, totalRealCaja: 120,
        lineas: [{
          id: lineaId, productoId: p.id,
          precioVentaUsado: 10, cantidad: 12, subtotal: 120
        }]
      },
      token
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.costoTotal, 64)
    assert.equal(r.body.ganancia, 56)
    assert.equal(r.body.diferencia, 0)
    assert.deepEqual(r.body.faltantes, [])

    const enBd = (await filas('cuadres', `id = '${cuadre.id}'`))[0]
    assert.equal(enBd.estado, 'cerrado')
    assert.equal(Number(enBd.costo_total), 64)
    // Movimientos de venta FIFO creados.
    const movs = await filas(
      'movimientos_inventario',
      `cuadre_id = '${cuadre.id}' AND tipo = 'venta'`
    )
    assert.ok(movs.length >= 2, 'deberia consumir de los dos lotes en orden')
  })

  it('cerrar sin stock no bloquea pero reporta faltantes', async () => {
    const { productoId } = await montarTienda('falta', { stock: 2 })
    const cuadre = await crearCuadre()
    const r = await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 50, totalRealCaja: 50,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 5, subtotal: 50
        }]
      },
      token
    })
    assert.equal(r.status, 200, 'el faltante avisa, no bloquea')
    assert.ok((r.body.faltantes ?? []).length > 0)
    assert.equal((await filas('cuadres', `id = '${cuadre.id}'`))[0].estado, 'cerrado')
  })

  it('cerrar dos veces da 409; cerrar ajeno da 404', async () => {
    const cuadre = await crearCuadre()
    const c1 = await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: { totalEsperado: 0, totalRealCaja: 0, lineas: [] }, token
    })
    assert.equal(c1.status, 200)
    const c2 = await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: { totalEsperado: 0, totalRealCaja: 0, lineas: [] }, token
    })
    assert.equal(c2.status, 409)
    const ajeno = await raw('POST', `/api/cuadres/${ID_INEXISTENTE}/cerrar`, {
      body: { totalEsperado: 0, totalRealCaja: 0, lineas: [] }, token
    })
    assert.equal(ajeno.status, 404)
  })

  it('reabrir revierte con contramovimientos y cuenta reaperturas', async () => {
    const { productoId } = await montarTienda('reabre', { stock: 5 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 30, totalRealCaja: 30,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 3, subtotal: 30
        }]
      },
      token, status: 200
    })
    const r = await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, {
      body: {}, token
    })
    assert.equal(r.status, 200)
    const enBd = (await filas('cuadres', `id = '${cuadre.id}'`))[0]
    assert.equal(enBd.estado, 'abierto')
    assert.equal(enBd.reabierto_veces, 1)
    assert.equal(enBd.total_real_caja, null)
    assert.equal(enBd.costo_total, null)
    // Anulacion por contramovimiento, no borrado.
    const anul = await filas(
      'movimientos_inventario',
      `cuadre_id = '${cuadre.id}' AND tipo = 'anulacion'`
    )
    assert.ok(anul.length > 0)
  })

  it('reabrir un cuadre abierto da 409', async () => {
    const cuadre = await crearCuadre()
    const r = await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token })
    assert.equal(r.status, 409)
  })
})

describe('fiado normal y pagos', () => {
  it('deuda dentro del tope + cobro parcial y total', async () => {
    const { productoId } = await montarTienda('fiado', { stock: 10 })
    const cuadre = await crearCuadre()
    // Vender 6 para tener tope.
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 60, totalRealCaja: 0,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 6, subtotal: 60
        }]
      },
      token, status: 200
    })
    // Reabrir para operar fiado del dia (el tope lee lineas del cuadre).
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const cli = await crearCliente('fiado')
    const deuda = await post('/api/cuentas-fiado', {
      clienteId: cli.id,
      cuadreOrigenId: cuadre.id,
      items: [{ productoId, cantidad: 4, precioVentaUsado: 10 }]
    }, { token, status: 200 })
    assert.equal(deuda.estado, 'pendiente')

    // Cobro parcial a caja (el status 200 ya prueba la creacion).
    await post('/api/pagos-fiado', {
      cuentaFiadoId: deuda.id, cuadreId: cuadre.id, monto: 15, formaPago: 'efectivo'
    }, { token, status: 200 })
    const trasParcial = (await filas('cuentas_fiado', `id = '${deuda.id}'`))[0]
    assert.equal(trasParcial.estado, 'parcial')

    // Cobro por encima del saldo se rechaza.
    const exceso = await raw('POST', '/api/pagos-fiado', {
      body: { cuentaFiadoId: deuda.id, cuadreId: cuadre.id, monto: 9999, formaPago: 'efectivo' },
      token
    })
    assert.equal(exceso.status, 400)

    // Saldar el resto como cobro directo.
    const resto = Number(trasParcial.monto_total) - Number(trasParcial.monto_pagado)
    await post('/api/pagos-fiado', {
      cuentaFiadoId: deuda.id, cuadreId: null, monto: resto, formaPago: 'transferencia'
    }, { token, status: 200 })
    assert.equal((await filas('cuentas_fiado', `id = '${deuda.id}'`))[0].estado, 'pagada')

    // Cobrar una pagada da 409.
    const sobre = await raw('POST', '/api/pagos-fiado', {
      body: { cuentaFiadoId: deuda.id, cuadreId: null, monto: 1, formaPago: 'efectivo' },
      token
    })
    assert.equal(sobre.status, 409)
  })

  it('deuda sobre el tope se rechaza', async () => {
    const { productoId } = await montarTienda('tope', { stock: 10 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 20, totalRealCaja: 20,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 2, subtotal: 20
        }]
      },
      token, status: 200
    })
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const cli = await crearCliente('tope')
    const r = await raw('POST', '/api/cuentas-fiado', {
      body: {
        clienteId: cli.id,
        cuadreOrigenId: cuadre.id,
        items: [{ productoId, cantidad: 9, precioVentaUsado: 10 }]
      },
      token
    })
    assert.equal(r.status, 400)
    assert.match(mensajeDe(r.body), /tope/i)
  })

  it('pago a cuenta inexistente da 404', async () => {
    const r = await raw('POST', '/api/pagos-fiado', {
      body: {
        cuentaFiadoId: ID_INEXISTENTE,
        cuadreId: null, monto: 5, formaPago: 'efectivo'
      },
      token
    })
    assert.equal(r.status, 404)
  })
})

describe('deudas y ventas directas (fuera del cuadre)', () => {
  it('deuda directa descuenta FIFO y congela costo/ganancia', async () => {
    const { productoId } = await montarTienda('directa', { stock: 8, compra: 4, venta: 10 })
    const cli = await crearCliente('directa')
    const r = await post('/api/cuentas-fiado/directas', {
      clienteId: cli.id,
      ubicacion: 'quiosco',
      lineas: [{ productoId, cantidad: 3, precioVentaUsado: 10 }]
    }, { token, status: 200 })
    assert.ok(r.id)
    const enBd = (await filas('cuentas_fiado', `id = '${r.id}'`))[0]
    assert.equal(enBd.cuadre_origen_id, null)
    assert.equal(Number(enBd.costo_total), 12)
    assert.equal(Number(enBd.ganancia), 18)
  })

  it('directa sin stock da 400 y no escribe nada', async () => {
    const { productoId } = await montarTienda('dirvacia', { stock: 1 })
    const cli = await crearCliente('dirvacia')
    // Acotado a mis fixtures: los conteos globales cambian por los tests
    // paralelos. Lo que prueba atomicidad es que MI request no dejo nada.
    const antesMovs = await filas('movimientos_inventario', `producto_id = '${productoId}'`)
    const r = await raw('POST', '/api/cuentas-fiado/directas', {
      body: {
        clienteId: cli.id,
        ubicacion: 'quiosco',
        lineas: [{ productoId, cantidad: 50, precioVentaUsado: 10 }]
      },
      token
    })
    assert.equal(r.status, 400)
    assert.equal((await filas('cuentas_fiado', `cliente_id = '${cli.id}'`)).length, 0)
    assert.equal(
      (await filas('movimientos_inventario', `producto_id = '${productoId}'`)).length,
      antesMovs.length
    )
  })

  it('venta directa en efectivo descuenta y no toca ningun cuadre', async () => {
    const { productoId } = await montarTienda('vdirecta', { stock: 6, compra: 3, venta: 9, alQuiosco: 2 })
    const r = await post('/api/ventas-directas', {
      ubicacion: 'almacen',
      lineas: [{ productoId, cantidad: 2, precioVentaUsado: 9 }]
    }, { token, status: 200 })
    assert.ok(r.id)
    const movs = await filas('movimientos_inventario', `venta_directa_id = '${r.id}'`)
    assert.ok(movs.length > 0)
    assert.ok(movs.every(m => m.cuadre_id === null))
  })
})

describe('transferencias y ajustes del dia', () => {
  it('transferencia acumula y el DELETE revierte con piso 0', async () => {
    const { productoId } = await montarTienda('transf', { stock: 10 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 100, totalRealCaja: 100,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 10, subtotal: 100
        }]
      },
      token, status: 200
    })
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const cli = await crearCliente('transf')
    const t = await post('/api/transferencias', {
      clienteId: cli.id,
      cuadreId: cuadre.id,
      items: [{ productoId, cantidad: 4, precioVentaUsado: 10 }]
    }, { token, status: 200 })
    assert.ok(t.id)
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].monto_transferencia), 40)

    // Sobre el tope se rechaza.
    const exceso = await raw('POST', '/api/transferencias', {
      body: {
        clienteId: cli.id,
        cuadreId: cuadre.id,
        items: [{ productoId, cantidad: 8, precioVentaUsado: 10 }]
      },
      token
    })
    assert.equal(exceso.status, 400)

    // Borrar revierte el acumulado.
    const del = await raw('DELETE', `/api/transferencias/${t.id}`, { token })
    assert.equal(del.status, 200)
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].monto_transferencia), 0)
  })

  it('ajuste regalo acumula y el DELETE revierte', async () => {
    const { productoId } = await montarTienda('ajuste', { stock: 10 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 100, totalRealCaja: 100,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 10, subtotal: 100
        }]
      },
      token, status: 200
    })
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const a = await post('/api/ajustes', {
      cuadreId: cuadre.id,
      clienteId: null,
      productoId,
      tipo: 'regalo',
      cantidad: 2,
      monto: 20
    }, { token, status: 200 })
    assert.ok(a.id)
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].monto_regalo), 20)
    await raw('DELETE', `/api/ajustes/${a.id}`, { token, status: 200 })
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].monto_regalo), 0)
  })
})

describe('edicion con reversion de acumulados', () => {
  it('ajuste regalo->descuento mueve los acumulados (flip de tipo)', async () => {
    const { productoId } = await montarTienda('flip', { stock: 10 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 100, totalRealCaja: 100,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 10, subtotal: 100
        }]
      },
      token, status: 200
    })
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const a = await post('/api/ajustes', {
      cuadreId: cuadre.id, clienteId: null, productoId,
      tipo: 'regalo', cantidad: 2, monto: 20
    }, { token, status: 200 })
    // Sin el fix, la reversion con [campo.name] se ignoraba en silencio.
    const flip = await raw('PATCH', `/api/ajustes/${a.id}`, {
      body: { tipo: 'descuento', monto: 5 }, token
    })
    assert.equal(flip.status, 200)
    const cuad = (await filas('cuadres', `id = '${cuadre.id}'`))[0]
    assert.equal(Number(cuad.monto_regalo), 0, 'el regalo viejo se revierte')
    assert.equal(Number(cuad.monto_descuento), 5, 'el descuento nuevo se suma')
  })

  it('editar deuda recalcula el total y congela precios viejos', async () => {
    const { productoId } = await montarTienda('editfiado', { stock: 10 })
    const cli = await crearCliente('editfiado')
    const d = await post('/api/cuentas-fiado/directas', {
      clienteId: cli.id, ubicacion: 'quiosco',
      lineas: [{ productoId, cantidad: 3, precioVentaUsado: 10 }]
    }, { token, status: 200 })
    const edit = await raw('PATCH', `/api/cuentas-fiado/${d.id}`, {
      body: {
        items: [
          { productoId, cantidad: 2, precioVentaUsado: 999 },
          { productoId, cantidad: 1, precioVentaUsado: 10 }
        ]
      },
      token
    })
    assert.equal(edit.status, 200)
    // Precio congelado de la linea existente (10, no 999) + nueva linea.
    const enBd = (await filas('cuentas_fiado', `id = '${d.id}'`))[0]
    assert.equal(Number(enBd.monto_total), 30)
  })

  it('editar deuda por debajo de lo pagado da 400', async () => {
    const { productoId } = await montarTienda('editpago', { stock: 10 })
    const cli = await crearCliente('editpago')
    const d = await post('/api/cuentas-fiado/directas', {
      clienteId: cli.id, ubicacion: 'quiosco',
      lineas: [{ productoId, cantidad: 4, precioVentaUsado: 10 }],
      montoPagadoInicial: 15, formaPagoInicial: 'efectivo'
    }, { token, status: 200 })
    const r = await raw('PATCH', `/api/cuentas-fiado/${d.id}`, {
      body: { items: [{ productoId, cantidad: 1, precioVentaUsado: 10 }] },
      token
    })
    assert.equal(r.status, 400)
  })

  it('editar transferencia ajusta el acumulado por delta', async () => {
    const { productoId } = await montarTienda('edittrans', { stock: 10 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 100, totalRealCaja: 100,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 10, subtotal: 100
        }]
      },
      token, status: 200
    })
    await raw('POST', `/api/cuadres/${cuadre.id}/reabrir`, { body: {}, token, status: 200 })
    const cli = await crearCliente('edittrans')
    const t = await post('/api/transferencias', {
      clienteId: cli.id, cuadreId: cuadre.id,
      items: [{ productoId, cantidad: 4, precioVentaUsado: 10 }]
    }, { token, status: 200 })
    const edit = await raw('PATCH', `/api/transferencias/${t.id}`, {
      body: { items: [{ productoId, cantidad: 2, precioVentaUsado: 10 }] },
      token
    })
    assert.equal(edit.status, 200)
    // 40 -> 20: delta -20 aplicado al acumulado.
    assert.equal(Number((await filas('cuadres', `id = '${cuadre.id}'`))[0].monto_transferencia), 20)
  })
})

describe('inventario: traspasos, mermas y lotes', () => {
  it('traspaso sin stock da 400 y no escribe nada', async () => {
    const { productoId } = await montarTienda('trasvacio', { stock: 1 })
    // Acotado a mi producto (ver test de directa sin stock).
    const antesM = await filas('movimientos_inventario', `producto_id = '${productoId}'`)
    const r = await raw('POST', '/api/inventario/traspasos', {
      body: { fecha: '2026-05-04', lineas: [{ productoId, cantidad: 99 }] },
      token
    })
    assert.equal(r.status, 400)
    assert.equal(
      (await filas('movimientos_inventario', `producto_id = '${productoId}'`)).length,
      antesM.length
    )
  })

  it('entrada valida stock y el saldo llega al quiosco', async () => {
    const p = await post('/api/productos', {
      nombre: nombreUnico('saldo_prod'), precioVentaActual: 12
    }, { token, status: 200 })
    const mala = await raw('POST', '/api/inventario/entradas', {
      body: {
        fechaEntrada: '2026-05-05',
        lineas: [{ productoId: p.id, cantidad: 0, precioUnitario: 5 }]
      },
      token
    })
    assert.equal(mala.status, 400)
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-05',
      lineas: [{ productoId: p.id, cantidad: 7, precioUnitario: 5 }]
    }, { token, status: 200 })
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-05',
      lineas: [{ productoId: p.id, cantidad: 4 }]
    }, { token, status: 200 })
    const saldos = await get('/api/inventario/saldos', { token, status: 200 })
    const fila = saldos.find(s => s.productoId === p.id)
    assert.ok(fila, 'el producto debe salir en saldos')
    assert.equal(fila.quiosco, 4)
    assert.equal(fila.almacen, 3)
  })

  it('merma descuenta y devolucion mueve quiosco->almacen', async () => {
    const { productoId } = await montarTienda('merma', { stock: 10 })
    await post('/api/inventario/ajustes', {
      productoId, tipo: 'merma', ubicacion: 'quiosco', cantidad: 3, motivo: 'roto'
    }, { token, status: 200 })
    const sinMotivo = await raw('POST', '/api/inventario/ajustes', {
      body: { productoId, tipo: 'merma', ubicacion: 'quiosco', cantidad: 1, motivo: '' },
      token
    })
    assert.equal(sinMotivo.status, 400)
    await post('/api/inventario/ajustes', {
      productoId, tipo: 'devolucion', ubicacion: 'quiosco', cantidad: 2, motivo: 'sobra'
    }, { token, status: 200 })
    // 10 - 3 merma = 7 en quiosco; la devolucion mueve 2 a almacen.
    const saldos = await get('/api/inventario/saldos', { token, status: 200 })
    const fila = saldos.find(s => s.productoId === productoId)
    assert.equal(fila.quiosco, 5)
    assert.equal(fila.almacen, 2)
  })

  it('corregir lote sin consumo actualiza espejo e historial; con consumo da 409', async () => {
    const p = await post('/api/productos', {
      nombre: nombreUnico('lote_prod'), precioVentaActual: 20
    }, { token, status: 200 })
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-06',
      lineas: [{ productoId: p.id, cantidad: 10, precioUnitario: 8 }]
    }, { token, status: 200 })
    const lotes = await get(`/api/lotes?productoId=${p.id}`, { token, status: 200 })
    assert.ok(lotes.length > 0)
    const lote = lotes[0]
    const sinMotivo = await raw('PATCH', `/api/lotes/${lote.id}`, {
      body: { precioUnitario: 9, motivo: '' }, token
    })
    assert.equal(sinMotivo.status, 400)
    const ok = await raw('PATCH', `/api/lotes/${lote.id}`, {
      body: { precioUnitario: 9, motivo: 'factura mal' }, token
    })
    assert.equal(ok.status, 200)
    assert.equal(Number((await filas('productos', `id = '${p.id}'`))[0].precio_compra_actual), 9)

    // Con consumo ya no se puede corregir.
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-06',
      lineas: [{ productoId: p.id, cantidad: 10 }]
    }, { token, status: 200 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 20, totalRealCaja: 20,
        lineas: [{
          id: randomUUID(), productoId: p.id,
          precioVentaUsado: 20, cantidad: 1, subtotal: 20
        }]
      },
      token, status: 200
    })
    const conConsumo = await raw('PATCH', `/api/lotes/${lote.id}`, {
      body: { precioUnitario: 10, motivo: 'tarde' }, token
    })
    assert.equal(conConsumo.status, 409)
  })
})

describe('recargas y cobros', () => {
  it('alta exige cliente; duplicada da 409; pagada cobra el nominal', async () => {
    const sinCli = await raw('POST', '/api/recargas', {
      body: {
        clienteId: null, telefonoDestino: telefonoUnico(), plataforma: 'banco',
        montoNominal: 360, costo: 324, ganancia: 36
      },
      token
    })
    assert.equal(sinCli.status, 400)

    const cli = await crearCliente('rec')
    const tel = telefonoUnico()
    const idTx = `T${Date.now()}${String(tel).slice(-4)}`.slice(0, 20)
    const r = await post('/api/recargas', {
      clienteId: cli.id, telefonoDestino: tel, plataforma: 'banco',
      montoNominal: 360, costo: 324, ganancia: 36,
      idTransaccion: idTx, estadoPago: 'pagada'
    }, { token, status: 200 })
    assert.equal(r.estadoPago, 'pagada')
    assert.equal(Number(r.montoCobrado), 360)

    const dup = await raw('POST', '/api/recargas', {
      body: {
        clienteId: cli.id, telefonoDestino: telefonoUnico(), plataforma: 'banco',
        montoNominal: 360, costo: 324, ganancia: 36, idTransaccion: idTx
      },
      token
    })
    assert.equal(dup.status, 409)
  })

  it('cobro parcial y total cambian el estado; exceso da 400', async () => {
    const cli = await crearCliente('cobro')
    const rec = await post('/api/recargas', {
      clienteId: cli.id, telefonoDestino: telefonoUnico(), plataforma: 'monedero',
      montoNominal: 200, costo: 180, ganancia: 20
    }, { token, status: 200 })
    assert.equal(rec.estadoPago, 'pendiente')

    const exceso = await raw('POST', '/api/cobros-recarga', {
      body: { recargaId: rec.id, monto: 999, formaPago: 'efectivo' }, token
    })
    assert.equal(exceso.status, 400)

    await post('/api/cobros-recarga', {
      recargaId: rec.id, monto: 80, formaPago: 'efectivo'
    }, { token, status: 200 })
    await post('/api/cobros-recarga', {
      recargaId: rec.id, monto: 120, formaPago: 'transferencia'
    }, { token, status: 200 })
    assert.equal((await filas('recargas', `id = '${rec.id}'`))[0].estado_pago, 'pagada')

    const desconocida = await raw('POST', '/api/cobros-recarga', {
      body: {
        recargaId: ID_INEXISTENTE,
        monto: 5, formaPago: 'efectivo'
      },
      token
    })
    assert.equal(desconocida.status, 404)
  })
})

describe('clientes, telefonos, productos y proveedores', () => {
  it('telefono duplicado da 409 y pertenece a un solo cliente', async () => {
    const a = await crearCliente('tel_a')
    const b = await crearCliente('tel_b')
    const tel = telefonoUnico()
    await post('/api/clientes-telefonos', {
      clienteId: a.id, telefono: tel
    }, { token, status: 200 })
    const dup = await raw('POST', '/api/clientes-telefonos', {
      body: { clienteId: b.id, telefono: tel }, token
    })
    assert.equal(dup.status, 409)
  })

  it('producto: el alta abre historial y el cambio de precio lo rota', async () => {
    const p = await post('/api/productos', {
      nombre: nombreUnico('hist_prod'), precioVentaActual: 15
    }, { token, status: 200 })
    const h1 = await get(`/api/productos/${p.id}/historial-precios`, { token, status: 200 })
    assert.ok(h1.length >= 1)
    // Solo una fila vigente (vigenteHasta null/ausente).
    assert.equal(h1.filter(h => !h.vigenteHasta).length, 1)

    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-07',
      lineas: [{ productoId: p.id, cantidad: 5, precioUnitario: 9 }]
    }, { token, status: 200 })
    const h2 = await get(`/api/productos/${p.id}/historial-precios`, { token, status: 200 })
    assert.ok(h2.length > h1.length, 'la entrada rota el precio: cierra y abre fila')
    assert.equal(h2.filter(h => !h.vigenteHasta).length, 1)
  })

  it('producto fresco se borra; con lineas de cuadre da 409', async () => {
    const fresco = await post('/api/productos', {
      nombre: nombreUnico('del_prod'), precioVentaActual: 5
    }, { token, status: 200 })
    const del = await raw('DELETE', `/api/productos/${fresco.id}`, { token })
    assert.equal(del.status, 200)

    const { productoId } = await montarTienda('nodel', { stock: 5 })
    const cuadre = await crearCuadre()
    await raw('POST', `/api/cuadres/${cuadre.id}/cerrar`, {
      body: {
        totalEsperado: 10, totalRealCaja: 10,
        lineas: [{
          id: randomUUID(), productoId,
          precioVentaUsado: 10, cantidad: 1, subtotal: 10
        }]
      },
      token, status: 200
    })
    const del2 = await raw('DELETE', `/api/productos/${productoId}`, { token })
    assert.equal(del2.status, 409)
  })

  it('proveedor con compras no se borra (409); sin compras si', async () => {
    const prov = await post('/api/proveedores', {
      nombre: nombreUnico('prov_del')
    }, { token, status: 200 })
    const delOk = await raw('DELETE', `/api/proveedores/${prov.id}`, { token })
    assert.equal(delOk.status, 200)

    const prov2 = await post('/api/proveedores', {
      nombre: nombreUnico('prov_con')
    }, { token, status: 200 })
    const p = await post('/api/productos', {
      nombre: nombreUnico('prov_prod'), precioVentaActual: 10
    }, { token, status: 200 })
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-08', proveedorId: prov2.id,
      lineas: [{ productoId: p.id, cantidad: 3, precioUnitario: 6 }]
    }, { token, status: 200 })
    const delNo = await raw('DELETE', `/api/proveedores/${prov2.id}`, { token })
    assert.equal(delNo.status, 409)
  })
})
