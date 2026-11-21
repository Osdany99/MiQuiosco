/**
 * DELETE /api/lotes/:id — anular una entrada equivocada.
 *
 * El caso real: se dio entrada a "10 refrescos" cuando eran 10 panes. Corregir
 * la cantidad o el precio no arregla el producto, así que la entrada se anula
 * (tombstone) mientras nada del lote se haya movido.
 *
 * Comprueba de paso que el tombstone no deja stock: el saldo del producto
 * vuelve a cero en /api/inventario/saldos y el lote queda fuera de FIFO.
 *
 * Paralelo-seguro: producto con nombre único y sin traspasos previos.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenJefe, get, post, raw, mensajeDe, nombreUnico
} from './cliente.js'

let token

const ID_INEXISTENTE = '123e4567-e89b-42d3-a456-426614174098'

before(async () => {
  token = await tokenJefe()
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion')
})

/** Producto nuevo con una entrada de `stock` unidades, sin tocarlo. */
async function productoConEntrada(prefijo, { stock = 10, compra = 5 } = {}) {
  const producto = await post('/api/productos', {
    nombre: nombreUnico(`${prefijo}_prod`), precioVentaActual: 10
  }, { token, status: 200 })
  const entrada = await post('/api/inventario/entradas', {
    fechaEntrada: '2026-05-01',
    lineas: [{ productoId: producto.id, cantidad: stock, precioUnitario: compra }]
  }, { token, status: 200 })
  const lotes = await get(`/api/lotes?productoId=${producto.id}`, { token, status: 200 })
  return { productoId: producto.id, entradaRef: entrada.entradaRef, lote: lotes[0] }
}

async function saldoProducto(productoId) {
  const saldos = await get('/api/inventario/saldos', { token, status: 200 })
  return saldos.find(s => s.productoId === productoId) ?? { almacen: 0, quiosco: 0 }
}

describe('DELETE /api/lotes/:id (anular entrada)', () => {
  it('un lote intacto se anula y su stock desaparece de las dos ubicaciones', async () => {
    const { productoId, lote } = await productoConEntrada('anula_ok')
    assert.equal(lote.anulable, true)
    const antes = await saldoProducto(productoId)
    assert.equal(antes.almacen, 10)

    const r = await raw('DELETE', `/api/lotes/${lote.id}`, {
      body: { motivo: 'era otro producto' }, token
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.anulado, true)

    const despues = await saldoProducto(productoId)
    assert.equal(despues.almacen, 0)
    assert.equal(despues.quiosco, 0)

    // El lote sigue existiendo (no se borra: queda el rastro), pero anulado y
    // sin saldo, así que ya no ofrece unidades en FIFO.
    const lotes = await get(`/api/lotes?productoId=${productoId}`, { token, status: 200 })
    assert.equal(lotes.length, 1)
    assert.equal(lotes[0].anulado, true)
    assert.equal(lotes[0].saldoAlmacen, 0)
    assert.equal(lotes[0].anulable, false)
  })

  it('si ya salió mercancía responde 409 y no toca nada', async () => {
    const { productoId, lote } = await productoConEntrada('anula_usado')
    await post('/api/inventario/traspasos', {
      fecha: '2026-05-02',
      lineas: [{ productoId, cantidad: 4 }]
    }, { token, status: 200 })

    const r = await raw('DELETE', `/api/lotes/${lote.id}`, {
      body: { motivo: 'era otro producto' }, token
    })
    assert.equal(r.status, 409)
    assert.match(mensajeDe(r.body), /ya salió mercancía/)

    const despues = await saldoProducto(productoId)
    assert.equal(despues.almacen, 6)
    assert.equal(despues.quiosco, 4)
    const lotes = await get(`/api/lotes?productoId=${productoId}`, { token, status: 200 })
    assert.equal(lotes[0].anulado, false)
    assert.equal(lotes[0].anulable, false)
  })

  it('un lote ya anulado da 409', async () => {
    const { lote } = await productoConEntrada('anula_doble')
    await raw('DELETE', `/api/lotes/${lote.id}`, { body: { motivo: 'x' }, token })
    const r = await raw('DELETE', `/api/lotes/${lote.id}`, { body: { motivo: 'otra vez' }, token })
    assert.equal(r.status, 409)
    assert.match(mensajeDe(r.body), /ya está anulado/)
  })

  it('sin motivo da 400 y un lote inexistente da 404', async () => {
    const { lote } = await productoConEntrada('anula_valid')
    const sinMotivo = await raw('DELETE', `/api/lotes/${lote.id}`, { body: {}, token })
    assert.equal(sinMotivo.status, 400)

    const inexistente = await raw('DELETE', `/api/lotes/${ID_INEXISTENTE}`, {
      body: { motivo: 'x' }, token
    })
    assert.equal(inexistente.status, 404)
  })

  it('sin token da 401', async () => {
    const { lote } = await productoConEntrada('anula_auth')
    const r = await raw('DELETE', `/api/lotes/${lote.id}`, { body: { motivo: 'x' } })
    assert.equal(r.status, 401)
  })
})
