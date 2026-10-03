/**
 * Protocolo push/pull (S1) + matriz de conflictos.
 *
 * Monta un segundo puesto (S) con fixtures propios y verifica el aislamiento:
 * el push con filas ajenas da 403 fail-closed (sin escritura parcial), el pull
 * solo trae lo propio (incluidas hijas por el puesto del padre), y los deletes
 * ajenos se rechazan. Ademas cubre la matriz de aceptados/conflictos que hasta
 * ahora no tenia ninguna prueba automatica.
 *
 * Paralelo-seguro: UUIDs aleatorios por test y fixtures con nombres unicos.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  tokenJefe, get, raw, nombreUnico
} from './cliente.js'
import {
  crearPuesto, crearUsuarioEnPuesto, insertar, filas, contar
} from './db-directa.js'

let tokenA
let tokenS
let puestoA
let puestoS

before(async () => {
  tokenA = await tokenJefe()
  const usuarios = await get('/api/usuarios', { token: tokenA, status: 200 })
  puestoA = usuarios.find(u => u.nombre === 'jefe').puestoId

  puestoS = await crearPuesto(nombreUnico('puesto_s'))
  const jefeS = await crearUsuarioEnPuesto(puestoS, nombreUnico('jefe_s'), 'jefe', '1234')
  const r = await raw('POST', '/api/auth/login', {
    body: { nombre_usuario: jefeS.nombre, pin: '1234' },
    headers: { 'x-forwarded-for': '10.99.61.1' }
  })
  assert.equal(r.status, 200)
  tokenS = r.body.token
})

function filaProducto(puestoId, nombre) {
  const ahora = new Date().toISOString()
  return {
    id: randomUUID(), puestoId, nombre,
    creadoEn: ahora, actualizadoEn: ahora
  }
}

describe('push: insercion y herencia de puesto', () => {
  it('fila nueva con puesto propio se acepta', async () => {
    const row = filaProducto(puestoA, nombreUnico('push_ok'))
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: [row], deletes: [] }, token: tokenA
    })
    assert.equal(r.status, 200)
    assert.ok(r.body.aceptados.includes(row.id))
    const enBd = await filas('productos', `id = '${row.id}'`)
    assert.equal(enBd.length, 1)
    assert.equal(enBd[0].puesto_id, puestoA)
  })

  it('fila sin puestoId lo hereda del JWT (espejo de crudCreate)', async () => {
    const row = filaProducto(puestoA, nombreUnico('push_hereda'))
    delete row.puestoId
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: [row], deletes: [] }, token: tokenA
    })
    assert.equal(r.status, 200)
    assert.ok(r.body.aceptados.includes(row.id))
    const enBd = await filas('productos', `id = '${row.id}'`)
    assert.equal(enBd[0].puesto_id, puestoA)
  })

  it('fila con puestoId ajeno da 403 y no escribe NADA (atomico)', async () => {
    const mala = filaProducto(puestoS, nombreUnico('push_mala'))
    const buena = filaProducto(puestoA, nombreUnico('push_buena'))
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: [mala, buena], deletes: [] }, token: tokenA
    })
    assert.equal(r.status, 403)
    // Ni siquiera la fila valida se escribio: el 403 aborta toda la tx.
    assert.equal((await filas('productos', `id = '${mala.id}'`)).length, 0)
    assert.equal((await filas('productos', `id = '${buena.id}'`)).length, 0)
  })

  it('update de fila ajena da 403 y no la toca', async () => {
    const id = await insertar('productos', { puesto_id: puestoS, nombre: nombreUnico('push_upd_b') })
    const row = {
      ...filaProducto(puestoS, 'cambiado'), id,
      creadoEn: new Date(Date.now() - 1000).toISOString()
    }
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: [row], deletes: [] }, token: tokenA
    })
    assert.equal(r.status, 403)
    const enBd = await filas('productos', `id = '${id}'`)
    assert.notEqual(enBd[0].nombre, 'cambiado')
  })

  it('update propio mas nuevo acepta; mas viejo es conflicto', async () => {
    const id = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('push_ver') })
    const base = await filas('productos', `id = '${id}'`)
    const serverTs = new Date(base[0].actualizado_en).getTime()

    const viejo = {
      id, puestoId: puestoA, nombre: 'viejo',
      creadoEn: new Date(serverTs - 60000).toISOString(),
      actualizadoEn: new Date(serverTs - 60000).toISOString()
    }
    const r1 = await raw('POST', '/api/sync/push', {
      body: { productos: [viejo], deletes: [] }, token: tokenA
    })
    assert.equal(r1.status, 200)
    assert.ok(!r1.body.aceptados.includes(id), 'lo viejo no se acepta')
    assert.ok(
      (r1.body.conflictos?.productos ?? []).length === 1,
      'lo viejo se reporta como conflicto'
    )

    const nuevo = {
      id, puestoId: puestoA, nombre: 'nuevo',
      creadoEn: new Date(serverTs - 60000).toISOString(),
      actualizadoEn: new Date(Date.now() + 60000).toISOString()
    }
    const r2 = await raw('POST', '/api/sync/push', {
      body: { productos: [nuevo], deletes: [] }, token: tokenA
    })
    assert.equal(r2.status, 200)
    assert.ok(r2.body.aceptados.includes(id))
    assert.equal((await filas('productos', `id = '${id}'`))[0].nombre, 'nuevo')
  })

  it('insertOnly: id existente es conflicto con la version del servidor', async () => {
    const cli = await insertar('clientes', { puesto_id: puestoA, nombre: nombreUnico('cli_io') })
    const cta = await insertar('cuentas_fiado', {
      puesto_id: puestoA, cliente_id: cli, monto_total: 100
    })
    const prod = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_io') })
    const itemId = await insertar('cuentas_fiado_items', {
      cuenta_fiado_id: cta, producto_id: prod,
      cantidad: 1, precio_venta_usado: 100, subtotal: 100
    })
    const ahora = new Date().toISOString()
    const r = await raw('POST', '/api/sync/push', {
      body: {
        cuentas_fiado_items: [{
          id: itemId, cuentaFiadoId: cta, productoId: prod,
          cantidad: 5, precioVentaUsado: 100, subtotal: 500,
          creadoEn: ahora, actualizadoEn: ahora
        }],
        deletes: []
      },
      token: tokenA
    })
    assert.equal(r.status, 200)
    assert.ok(!r.body.aceptados.includes(itemId))
    const conf = r.body.conflictos?.cuentas_fiado_items ?? []
    assert.equal(conf.length, 1)
    assert.equal(conf[0].server.cantidad, 1, 'el servidor es autoritativo')
    // La BD no se toco.
    assert.equal((await filas('cuentas_fiado_items', `id = '${itemId}'`))[0].cantidad, 1)
  })

  it('hija con padre ajeno da 403; con padre inexistente da 404', async () => {
    const cliS = await insertar('clientes', { puesto_id: puestoS, nombre: nombreUnico('cli_hs') })
    const ctaS = await insertar('cuentas_fiado', {
      puesto_id: puestoS, cliente_id: cliS, monto_total: 10
    })
    const prodA = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('prod_ha') })
    const ahora = new Date().toISOString()

    const ajeno = await raw('POST', '/api/sync/push', {
      body: {
        cuentas_fiado_items: [{
          id: randomUUID(), cuentaFiadoId: ctaS, productoId: prodA,
          cantidad: 1, precioVentaUsado: 10, subtotal: 10,
          creadoEn: ahora, actualizadoEn: ahora
        }],
        deletes: []
      },
      token: tokenA
    })
    assert.equal(ajeno.status, 403)

    const huerfano = await raw('POST', '/api/sync/push', {
      body: {
        cuentas_fiado_items: [{
          id: randomUUID(), cuentaFiadoId: randomUUID(), productoId: prodA,
          cantidad: 1, precioVentaUsado: 10, subtotal: 10,
          creadoEn: ahora, actualizadoEn: ahora
        }],
        deletes: []
      },
      token: tokenA
    })
    // Antes era un 500 opaco por violacion de FK.
    assert.equal(huerfano.status, 404)
  })

  it('payload con tabla no-sync se ignora (200, sin aceptados)', async () => {
    const r = await raw('POST', '/api/sync/push', {
      body: { sms_etecsa: [{ id: randomUUID(), cuerpo: 'x' }], deletes: [] },
      token: tokenA
    })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.aceptados, [])
  })

  it('payload invalido da 400', async () => {
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: 'no-es-un-array', deletes: [] }, token: tokenA
    })
    assert.equal(r.status, 400)
  })
})

describe('push: deletes con puesto', () => {
  it('delete propio se acepta y deja tombstone', async () => {
    const id = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('push_del') })
    const r = await raw('POST', '/api/sync/push', {
      body: { deletes: [{ tabla: 'productos', id }] }, token: tokenA
    })
    assert.equal(r.status, 200)
    assert.ok(r.body.deletesAceptados.some(d => d.id === id))
    assert.equal((await filas('productos', `id = '${id}'`)).length, 0)
    assert.equal((await filas('deleted_records', `registro_id = '${id}'`)).length, 1)
  })

  it('delete inexistente se acepta sin tombstone (idempotente)', async () => {
    const id = randomUUID()
    const antes = await contar('deleted_records')
    const r = await raw('POST', '/api/sync/push', {
      body: { deletes: [{ tabla: 'productos', id }] }, token: tokenA
    })
    assert.equal(r.status, 200)
    assert.ok(r.body.deletesAceptados.some(d => d.id === id))
    assert.equal(await contar('deleted_records'), antes, 'sin tombstone para lo que nunca existio')
  })

  it('delete de fila ajena da 403 y no la borra', async () => {
    const id = await insertar('productos', { puesto_id: puestoS, nombre: nombreUnico('push_delb') })
    const r = await raw('POST', '/api/sync/push', {
      body: { deletes: [{ tabla: 'productos', id }] }, token: tokenA
    })
    assert.equal(r.status, 403)
    assert.equal((await filas('productos', `id = '${id}'`)).length, 1)
  })

  it('delete de tabla no-sync se ignora', async () => {
    const r = await raw('POST', '/api/sync/push', {
      body: { deletes: [{ tabla: 'sms_etecsa', id: randomUUID() }] }, token: tokenA
    })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.deletesAceptados, [])
  })
})

describe('pull: solo lo propio', () => {
  it('pull trae filas propias y nunca las ajenas', async () => {
    const nombreA = nombreUnico('pull_a')
    const nombreB = nombreUnico('pull_b')
    await insertar('productos', { puesto_id: puestoA, nombre: nombreA })
    await insertar('productos', { puesto_id: puestoS, nombre: nombreB })

    const r = await raw('GET', '/api/sync/pull?desde=0', { token: tokenA })
    assert.equal(r.status, 200)
    const nombres = (r.body.productos ?? []).map(p => p.nombre)
    assert.ok(nombres.includes(nombreA))
    assert.ok(!nombres.includes(nombreB))
    assert.ok(typeof r.body.timestamp_servidor === 'number')
  })

  it('pull filtra hijas por el puesto del padre', async () => {
    const cuadA = await insertar('cuadres', {
      puesto_id: puestoA, fecha: '2026-03-01', jefe_id: (await filaJefeA()), total_esperado: 0
    })
    const cuadS = await insertar('cuadres', {
      puesto_id: puestoS, fecha: '2026-03-02', jefe_id: (await filaJefeS()), total_esperado: 0
    })
    const prodA = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('pull_pa') })
    const prodS = await insertar('productos', { puesto_id: puestoS, nombre: nombreUnico('pull_ps') })
    const itemA = await insertar('cuadre_items', {
      cuadre_id: cuadA, producto_id: prodA,
      precio_venta_usado: 1, cantidad: 1, subtotal: 1
    })
    const itemS = await insertar('cuadre_items', {
      cuadre_id: cuadS, producto_id: prodS,
      precio_venta_usado: 2, cantidad: 1, subtotal: 2
    })
    const r = await raw('GET', '/api/sync/pull?desde=0', { token: tokenA })
    assert.equal(r.status, 200)
    const ids = (r.body.cuadre_items ?? []).map(i => i.id)
    assert.ok(ids.includes(itemA))
    assert.ok(!ids.includes(itemS))
  })

  it('simetria: pull con token S solo trae S', async () => {
    const nombreA = nombreUnico('pull_sa')
    const nombreS = nombreUnico('pull_ss')
    await insertar('productos', { puesto_id: puestoA, nombre: nombreA })
    await insertar('productos', { puesto_id: puestoS, nombre: nombreS })
    const r = await raw('GET', '/api/sync/pull?desde=0', { token: tokenS })
    assert.equal(r.status, 200)
    const nombres = (r.body.productos ?? []).map(p => p.nombre)
    assert.ok(nombres.includes(nombreS))
    assert.ok(!nombres.includes(nombreA))
  })

  it('simetria: push de S sobre fila de A da 403', async () => {
    const id = await insertar('productos', { puesto_id: puestoA, nombre: nombreUnico('push_sa') })
    const row = {
      ...filaProducto(puestoA, 'cambiado'), id,
      creadoEn: new Date(Date.now() - 1000).toISOString()
    }
    const r = await raw('POST', '/api/sync/push', {
      body: { productos: [row], deletes: [] }, token: tokenS
    })
    assert.equal(r.status, 403)
  })

  it('pull con desde futuro da vacio y watermark = desde', async () => {
    const futuro = Date.now() + 3600000
    const r = await raw('GET', `/api/sync/pull?desde=${futuro}`, { token: tokenA })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.productos, [])
    assert.equal(r.body.timestamp_servidor, futuro)
  })

  it('pull sin desde arranca en epoch', async () => {
    const r = await raw('GET', '/api/sync/pull', { token: tokenA })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body.productos))
  })
})

async function filaJefeA() {
  const rows = await filas('usuarios', `nombre = 'jefe'`)
  return rows[0].id
}

async function filaJefeS() {
  const rows = await filas('usuarios', `puesto_id = '${puestoS}'`)
  return rows[0].id
}
