/**
 * Aislamiento por puesto en endpoints REST (S2-S5) + joins de cliente (fix).
 *
 * Monta un segundo puesto (B) con su jefe y fixtures propios, y verifica que el
 * token del puesto A (seed) no pueda leer ni tocar nada de B: 404 sin oraculo
 * en [id], listas filtradas, y filtros por id ajeno que devuelven vacio.
 *
 * Tambien cubre el bug funcional de los joins: transferencias y cuentas-fiado
 * hacian innerJoin contra usuarios con un clienteId que desde la 0018 apunta a
 * clientes, asi que las deudas/transferencias nuevas DESAPARECIAN del listado.
 *
 * Paralelo-seguro: el puesto B y los tokens se crean una vez en before(); cada
 * test crea sus fixtures con nombres/UUIDs/fechas unicos.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenJefe, get, post, raw, nombreUnico
} from './cliente.js'
import {
  crearPuesto, crearUsuarioEnPuesto, insertar, filas
} from './db-directa.js'

let tokenA
let tokenB
let puestoA
let puestoB
let jefeB

before(async () => {
  tokenA = await tokenJefe()
  const usuarios = await get('/api/usuarios', { token: tokenA, status: 200 })
  const jefeA = usuarios.find(u => u.nombre === 'jefe')
  puestoA = jefeA.puestoId

  puestoB = await crearPuesto(nombreUnico('puesto_b'))
  jefeB = await crearUsuarioEnPuesto(puestoB, nombreUnico('jefe_b'), 'jefe', '1234')
  const r = await raw('POST', '/api/auth/login', {
    body: { nombre_usuario: jefeB.nombre, pin: '1234' },
    headers: { 'x-forwarded-for': '10.99.60.1' }
  })
  assert.equal(r.status, 200)
  tokenB = r.body.token
})

/** Fecha unica por test para el unique (puesto_id, fecha) de cuadres. */
let diaSeq = 10
function fechaUnica() {
  diaSeq += 1
  return `2026-02-${String(diaSeq).padStart(2, '0')}`
}

/** Telefono unico de 10 digitos (UNIQUE global en la BD). */
let telSeq = 0
function telefonoUnico() {
  telSeq += 1
  return `53${String(61000000 + telSeq)}`
}

describe('S2: cuadres ajenos dan 404 sin oraculo', () => {
  it('GET /api/cuadres/:id ajeno da 404', async () => {
    const id = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const r = await raw('GET', `/api/cuadres/${id}`, { token: tokenA })
    assert.equal(r.status, 404)
  })

  it('PATCH /api/cuadres/:id ajeno da 404 y no modifica', async () => {
    const id = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const r = await raw('PATCH', `/api/cuadres/${id}`, {
      body: { notas: 'hack' }, token: tokenA
    })
    assert.equal(r.status, 404)
    const enBd = await filas('cuadres', `id = '${id}'`)
    assert.equal(enBd[0].notas, null)
  })

  it('PATCH propio sigue funcionando (200)', async () => {
    const id = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const r = await raw('PATCH', `/api/cuadres/${id}`, {
      body: { notas: 'nota propia' }, token: tokenA
    })
    assert.equal(r.status, 200)
  })
})

describe('S3: DELETE cuadres con cascade y guarda de estado', () => {
  it('DELETE cuadre ajeno da 404', async () => {
    const id = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const r = await raw('DELETE', `/api/cuadres/${id}`, { token: tokenA })
    assert.equal(r.status, 404)
    assert.equal((await filas('cuadres', `id = '${id}'`)).length, 1)
  })

  it('DELETE propio abierto borra con sus lineas', async () => {
    const cuadreId = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const prodId = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_del') })
    await insertar('cuadre_items', {
      cuadre_id: cuadreId, producto_id: prodId,
      precio_venta_usado: 10, cantidad: 2, subtotal: 20
    })
    const r = await raw('DELETE', `/api/cuadres/${cuadreId}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.equal((await filas('cuadres', `id = '${cuadreId}'`)).length, 0)
    assert.equal((await filas('cuadre_items', `cuadre_id = '${cuadreId}'`)).length, 0)
  })

  it('DELETE propio cerrado da 409 (historia contable intocable)', async () => {
    const cuadreId = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id,
      total_esperado: 100, estado: 'cerrado'
    })
    const r = await raw('DELETE', `/api/cuadres/${cuadreId}`, { token: tokenA })
    assert.equal(r.status, 409)
    assert.equal((await filas('cuadres', `id = '${cuadreId}'`)).length, 1)
  })
})

describe('S4: [id] genericos ajenos dan 404', () => {
  it('GET /api/productos/:id ajeno da 404; propio da 200', async () => {
    const idB = await insertar('productos', { puesto_id: puestoB, nombre: nombreUnico('prod_b') })
    const idA = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_a') })
    const rb = await raw('GET', `/api/productos/${idB}`, { token: tokenA })
    assert.equal(rb.status, 404)
    const ra = await raw('GET', `/api/productos/${idA}`, { token: tokenA })
    assert.equal(ra.status, 200)
  })

  it('PATCH /api/clientes/:id ajeno da 404', async () => {
    const idB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_b') })
    const r = await raw('PATCH', `/api/clientes/${idB}`, {
      body: { notas: 'hack' }, token: tokenA
    })
    assert.equal(r.status, 404)
  })

  it('GET /api/usuarios/:id ajeno da 404', async () => {
    const r = await raw('GET', `/api/usuarios/${jefeB.id}`, { token: tokenA })
    assert.equal(r.status, 404)
  })

  it('PATCH /api/recargas/:id ajeno da 404', async () => {
    const idB = await insertar('recargas', {
      puesto_id: puestoB, telefono_destino: telefonoUnico(),
      plataforma: 'banco', monto_nominal: 360, costo: 324, ganancia: 36
    })
    // OJO: el body va en camelCase (los schemas Zod usan clienteId/estadoPago);
    // en snake_case se stripea y da 400 'Nada que actualizar'.
    const r = await raw('PATCH', `/api/recargas/${idB}`, {
      body: { estadoPago: 'pagada' }, token: tokenA
    })
    assert.equal(r.status, 404)
  })

  it('DELETE /api/cuentas-fiado/:id ajeno da 404', async () => {
    const cliB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_fiado_b') })
    const idB = await insertar('cuentas_fiado', {
      puesto_id: puestoB, cliente_id: cliB, monto_total: 50
    })
    const r = await raw('DELETE', `/api/cuentas-fiado/${idB}`, { token: tokenA })
    assert.equal(r.status, 404)
    assert.equal((await filas('cuentas_fiado', `id = '${idB}'`)).length, 1)
  })

  it('POST /api/cuadre-items con cuadre ajeno da 404', async () => {
    const cuadreB = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const prodA = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_cu') })
    const r = await raw('POST', '/api/cuadre-items', {
      body: {
        cuadreId: cuadreB, productoId: prodA,
        precioVentaUsado: 10, cantidad: 1, subtotal: 10
      },
      token: tokenA
    })
    assert.equal(r.status, 404)
  })

  it('GET /api/cuadre-items?cuadre_id= ajeno da lista vacia', async () => {
    const cuadreB = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const prodB = await insertar('productos', { puesto_id: puestoB, nombre: nombreUnico('prod_cub') })
    await insertar('cuadre_items', {
      cuadre_id: cuadreB, producto_id: prodB,
      precio_venta_usado: 5, cantidad: 1, subtotal: 5
    })
    const r = await raw('GET', `/api/cuadre-items?cuadre_id=${cuadreB}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, [])
  })
})

describe('S5: listas solo del puesto propio', () => {
  it('GET /api/transferencias no trae las ajenas', async () => {
    const cliB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_tb') })
    const cliA = await insertar('clientes', { puesto_id: puestoA, nombre: nombreUnico('cli_ta') })
    const cuadB = await insertar('cuadres', {
      puesto_id: puestoB, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const cuadA = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    await insertar('transferencias', {
      puesto_id: puestoB, cliente_id: cliB, cuadre_id: cuadB, monto_total: 99
    })
    const idA = await insertar('transferencias', {
      puesto_id: puestoA, cliente_id: cliA, cuadre_id: cuadA, monto_total: 11
    })
    const lista = await get('/api/transferencias', { token: tokenA, status: 200 })
    const ids = lista.map(t => t.id)
    assert.ok(ids.includes(idA), 'la propia debe estar')
    assert.ok(!lista.some(t => t.montoTotal === 99), 'la ajena no debe estar')
  })

  it('GET /api/cuentas-fiado no trae las ajenas', async () => {
    const cliB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_fb') })
    await insertar('cuentas_fiado', {
      puesto_id: puestoB, cliente_id: cliB, monto_total: 4242
    })
    const lista = await get('/api/cuentas-fiado', { token: tokenA, status: 200 })
    assert.ok(!lista.some(c => c.montoTotal === 4242))
  })

  it('GET /api/pagos-fiado?cuenta_fiado_id= ajeno da vacio', async () => {
    const cliB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_pb') })
    const ctaB = await insertar('cuentas_fiado', {
      puesto_id: puestoB, cliente_id: cliB, monto_total: 100
    })
    await insertar('pagos_fiado', {
      cuenta_fiado_id: ctaB, monto: 10, forma_pago: 'efectivo'
    })
    const r = await raw('GET', `/api/pagos-fiado?cuenta_fiado_id=${ctaB}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, [])
  })

  it('GET /api/clientes-telefonos no trae los ajenos', async () => {
    const cliB = await insertar('clientes', { puesto_id: puestoB, nombre: nombreUnico('cli_cb') })
    const tel = telefonoUnico()
    await insertar('clientes_telefonos', {
      puesto_id: puestoB, cliente_id: cliB, telefono: tel
    })
    const lista = await get('/api/clientes-telefonos', { token: tokenA, status: 200 })
    assert.ok(!lista.some(t => t.telefono === tel))
  })

  it('GET /api/cobros-recarga?recargaId= ajeno da vacio', async () => {
    const recB = await insertar('recargas', {
      puesto_id: puestoB, telefono_destino: telefonoUnico(),
      plataforma: 'monedero', monto_nominal: 120, costo: 108, ganancia: 12
    })
    await insertar('cobros_recarga', {
      recarga_id: recB, monto: 120, forma_pago: 'efectivo'
    })
    const r = await raw('GET', `/api/cobros-recarga?recargaId=${recB}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, [])
  })
})

describe('joins de cliente: deudas y transferencias nuevas visibles', () => {
  it('una transferencia con cliente de la tabla clientes aparece con su nombre', async () => {
    const cli = await insertar('clientes', { puesto_id: puestoA, nombre: nombreUnico('cli_tj') })
    const cuad = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const id = await insertar('transferencias', {
      puesto_id: puestoA, cliente_id: cli, cuadre_id: cuad, monto_total: 77
    })
    // Antes del fix (innerJoin usuarios) esta fila DESAPARECIA del listado.
    const lista = await get('/api/transferencias', { token: tokenA, status: 200 })
    const fila = lista.find(t => t.id === id)
    assert.ok(fila, 'la transferencia propia debe estar en el listado')
    assert.match(fila.nombreCliente ?? '', /cli_tj/)
  })

  it('una deuda con cliente de la tabla clientes aparece con su nombre', async () => {
    const cli = await insertar('clientes', { puesto_id: puestoA, nombre: nombreUnico('cli_fj') })
    const id = await insertar('cuentas_fiado', {
      puesto_id: puestoA, cliente_id: cli, monto_total: 66
    })
    const lista = await get('/api/cuentas-fiado', { token: tokenA, status: 200 })
    const fila = lista.find(c => c.id === id)
    assert.ok(fila, 'la deuda propia debe estar en el listado')
    assert.match(fila.nombreCliente ?? '', /cli_fj/)
  })

  it('el detalle de la deuda trae el nombre del cliente', async () => {
    const cli = await insertar('clientes', { puesto_id: puestoA, nombre: nombreUnico('cli_fd') })
    const id = await insertar('cuentas_fiado', {
      puesto_id: puestoA, cliente_id: cli, monto_total: 55
    })
    const r = await raw('GET', `/api/cuentas-fiado/${id}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.match(r.body.nombreCliente ?? '', /cli_fd/)
  })
})

describe('simetria: B tampoco toca lo de A', () => {
  it('B opera lo propio y recibe 404 en lo ajeno', async () => {
    const idA = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_sa') })
    const idB = await insertar('productos', { puesto_id: puestoB, nombre: nombreUnico('prod_sb') })
    const propio = await raw('GET', `/api/productos/${idB}`, { token: tokenB })
    assert.equal(propio.status, 200)
    const ajeno = await raw('PATCH', `/api/productos/${idA}`, {
      body: { nombre: 'hack' }, token: tokenB
    })
    assert.equal(ajeno.status, 404)
    assert.equal((await filas('productos', `id = '${idA}'`))[0].nombre.slice(0, 7), 'prod_sa')
  })
})

describe('listas crud: el flag sin auth no filtraba (fix)', () => {
  it('GET /api/productos no trae los de B', async () => {
    const nombre = nombreUnico('prod_lb')
    await post('/api/productos', { nombre, precioVentaActual: 5 }, { token: tokenB, status: 200 })
    const lista = await get('/api/productos', { token: tokenA, status: 200 })
    assert.ok(!lista.some(p => p.nombre === nombre))
  })

  it('GET /api/cuadres no trae los de B', async () => {
    const fecha = fechaUnica()
    await post('/api/cuadres', { fecha }, { token: tokenB, status: 200 })
    const lista = await get('/api/cuadres', { token: tokenA, status: 200 })
    assert.ok(!lista.some(c => c.fecha === fecha))
  })

  it('GET /api/proveedores no trae los de B', async () => {
    const nombre = nombreUnico('prov_lb')
    await post('/api/proveedores', { nombre }, { token: tokenB, status: 200 })
    const lista = await get('/api/proveedores', { token: tokenA, status: 200 })
    assert.ok(!lista.some(p => p.nombre === nombre))
  })

  it('GET /api/traspasos y movimientos no traen los de B', async () => {
    const nombre = nombreUnico('tras_lb')
    const prod = await post('/api/productos', { nombre, precioVentaActual: 8 }, { token: tokenB, status: 200 })
    await post('/api/inventario/entradas', {
      fechaEntrada: '2026-05-10',
      lineas: [{ productoId: prod.id, cantidad: 4, precioUnitario: 3 }]
    }, { token: tokenB, status: 200 })
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-10',
      lineas: [{ productoId: prod.id, cantidad: 4 }]
    }, { token: tokenB, status: 200 })
    const idsB = (await filas('traspasos', `puesto_id = '${puestoB}'`)).map(t => t.id)
    assert.ok(idsB.length > 0, 'B debe tener traspasos en la BD')
    const tras = await get('/api/traspasos', { token: tokenA, status: 200 })
    assert.ok(!tras.some(t => idsB.includes(t.id)))
    const movs = await get('/api/movimientos-inventario', { token: tokenA, status: 200 })
    assert.ok(!movs.some(m => m.productoId === prod.id))
  })
})

describe('cuadre-items propios siguen visibles', () => {
  it('GET /api/cuadre-items?cuadre_id= propio trae sus lineas', async () => {
    const cuad = await insertar('cuadres', {
      puesto_id: puestoA, fecha: fechaUnica(), jefe_id: jefeB.id, total_esperado: 0
    })
    const prod = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_cup') })
    await insertar('cuadre_items', {
      cuadre_id: cuad, producto_id: prod,
      precio_venta_usado: 7, cantidad: 3, subtotal: 21
    })
    const r = await raw('GET', `/api/cuadre-items?cuadre_id=${cuad}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.equal(r.body.length, 1)
  })
})
