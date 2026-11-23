import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearOperacionIds } from '../app/utils/voice/operacionIds.js'

describe('IDs idempotentes de operaciones de voz', () => {
  it('reutiliza el ID de la misma operación tras una corrección', () => {
    let siguiente = 0
    const ids = crearOperacionIds(() => `id-${++siguiente}`)
    const antes = ids.para('venta_fiada')
    // Una corrección no llama a reiniciar: el ejecutor recibe la misma clave.
    assert.equal(ids.para('venta_fiada'), antes)
    assert.equal(siguiente, 1)
  })

  it('cada pago de un cobro FIFO tiene su propio ID estable', () => {
    let siguiente = 0
    const ids = crearOperacionIds(() => `id-${++siguiente}`)
    const primero = ids.para('cobro:cuenta-1')
    const segundo = ids.para('cobro:cuenta-2')
    assert.notEqual(primero, segundo)
    assert.equal(ids.para('cobro:cuenta-1'), primero)
    assert.equal(ids.para('cobro:cuenta-2'), segundo)
    assert.equal(siguiente, 2)
  })

  it('un dictado nuevo crea otra operación, no deduplica una venta intencional', () => {
    let siguiente = 0
    const ids = crearOperacionIds(() => `id-${++siguiente}`)
    const anterior = ids.para('venta_fiada')
    ids.reiniciar()
    const nuevo = ids.para('venta_fiada')
    assert.notEqual(nuevo, anterior)
    assert.equal(siguiente, 2)
  })

  it('usa UUID válidos por defecto y exige una clave', () => {
    const ids = crearOperacionIds()
    assert.match(ids.para('deuda_dinero'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.throws(() => ids.para(''), /clave de idempotencia/)
  })
})
