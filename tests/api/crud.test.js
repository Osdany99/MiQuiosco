/**
 * Validaciones CRUD rapidas y manifiesto publico (cierra huecos de 2.11).
 *
 * Casos de exito+fallo por endpoint que no necesitan flujos transaccionales:
 * duplicados (409), schemas (400) y el manifiesto /api/app-version.
 * Paralelo-seguro: fixtures con nombres unicos, sin estado compartido.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenJefe, post, raw, nombreUnico
} from './cliente.js'

let token

before(async () => {
  token = await tokenJefe()
  assert.ok(token)
})

describe('GET /api/app-version (manifiesto publico)', () => {
  it('responde sin auth con la forma del manifiesto', async () => {
    const r = await raw('GET', '/api/app-version')
    assert.equal(r.status, 200)
    assert.equal(typeof r.body.latestVersionCode, 'number')
    assert.equal(typeof r.body.latestVersionName, 'string')
    assert.equal(typeof r.body.minVersionCode, 'number')
    assert.equal(typeof r.body.apkUrl, 'string')
    assert.equal(typeof r.body.changelog, 'string')
    assert.ok(['navegador', 'interno', 'automatico'].includes(r.body.metodoSugerido))
  })
})

describe('usuarios: validaciones', () => {
  it('nombre duplicado en el puesto da 409', async () => {
    const nombre = nombreUnico('dup_user')
    await post('/api/usuarios', { nombre, rol: 'trabajador', pin: '1234', activo: true }, { token, status: 200 })
    const dup = await raw('POST', '/api/usuarios', {
      body: { nombre, rol: 'trabajador', pin: '1234', activo: true }, token
    })
    assert.equal(dup.status, 409)
  })

  it('rol invalido da 400', async () => {
    const r = await raw('POST', '/api/usuarios', {
      body: { nombre: nombreUnico('rol_malo'), rol: 'superadmin', pin: '1234' }, token
    })
    assert.equal(r.status, 400)
  })
})

describe('productos/clientes/proveedores: validaciones', () => {
  it('producto sin nombre da 400', async () => {
    const r = await raw('POST', '/api/productos', {
      body: { nombre: '', precioVentaActual: 5 }, token
    })
    assert.equal(r.status, 400)
  })

  it('producto con precio negativo da 400', async () => {
    const r = await raw('POST', '/api/productos', {
      body: { nombre: nombreUnico('neg'), precioVentaActual: -5 }, token
    })
    assert.equal(r.status, 400)
  })

  it('cliente sin nombre da 400; telefono con formato malo da 400', async () => {
    const c = await raw('POST', '/api/clientes', { body: { nombre: '' }, token })
    assert.equal(c.status, 400)
    const cli = await post('/api/clientes', { nombre: nombreUnico('tel_cli') }, { token, status: 200 })
    const t = await raw('POST', '/api/clientes-telefonos', {
      body: { clienteId: cli.id, telefono: '123' }, token
    })
    assert.equal(t.status, 400)
  })

  it('telefono a cliente inexistente da 404', async () => {
    const r = await raw('POST', '/api/clientes-telefonos', {
      body: { clienteId: '123e4567-e89b-42d3-a456-426614174099', telefono: '5350000001' },
      token
    })
    assert.equal(r.status, 404)
  })
})

describe('inventario y ventas: validaciones', () => {
  it('traspaso sin lineas da 400', async () => {
    const r = await raw('POST', '/api/inventario/traspasos', {
      body: { fecha: '2026-05-11', lineas: [] }, token
    })
    assert.equal(r.status, 400)
  })

  it('venta directa con ubicacion invalida da 400', async () => {
    const r = await raw('POST', '/api/ventas-directas', {
      body: { ubicacion: 'nube', lineas: [] }, token
    })
    assert.equal(r.status, 400)
  })

  it('cuadre con fecha invalida da 400', async () => {
    const r = await raw('POST', '/api/cuadres', { body: { fecha: 'ayer' }, token })
    assert.equal(r.status, 400)
  })

  it('linea de cuadre con tipo invalido da 400', async () => {
    const p = await post('/api/productos', {
      nombre: nombreUnico('tipo_prod'), precioVentaActual: 5
    }, { token, status: 200 })
    // Varias fechas candidatas: con KEEP_DB=1 la primera puede estar ocupada.
    let c = null
    for (const d of ['01', '02', '03', '04', '05']) {
      try {
        c = await post('/api/cuadres', { fecha: `2026-08-${d}` }, { token, status: 200 })
        break
      } catch { /* fecha ocupada, probar la siguiente */ }
    }
    assert.ok(c, 'se pudo crear un cuadre')
    const r = await raw('POST', '/api/cuadre-items', {
      body: {
        cuadreId: c.id, productoId: p.id, tipoLinea: 'regalito',
        precioVentaUsado: 5, cantidad: 1, subtotal: 5
      },
      token
    })
    assert.equal(r.status, 400)
  })
})

describe('listas hijas con filtro propio', () => {
  it('GET /api/historial_precios devuelve array (filtrado por puesto)', async () => {
    const r = await raw('GET', '/api/historial_precios', { token })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body))
  })

  it('GET /api/ventas-directas-items sin filtro devuelve array', async () => {
    const r = await raw('GET', '/api/ventas-directas-items', { token })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body))
  })

  it('GET /api/cuentas_fiado_items sin filtro devuelve array', async () => {
    const r = await raw('GET', '/api/cuentas_fiado_items', { token })
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body))
  })
})
