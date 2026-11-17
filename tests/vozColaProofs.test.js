import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_COLA,
  MAX_DIAS,
  MAX_INTENTOS,
  agregarProof,
  marcarIntentoFallido,
  proofsPendientes,
  purgarCola,
  quitarProof,
  sigueVigente
} from '../app/utils/voice/colaProofs.js'

function entrada(id, creado = new Date().toISOString(), extra = {}) {
  return { id, proof: { ts: creado, comando: 'venta_directa' }, creado, intentos: 0, ...extra }
}

describe('voz: cola de proofs — altas y bajas', () => {
  it('agrega al final y conserva el orden de llegada', () => {
    const cola = agregarProof(agregarProof([], entrada('a')), entrada('b'))
    assert.deepEqual(cola.map(i => i.id), ['a', 'b'])
  })

  it('un id repetido se reemplaza, no se duplica', () => {
    const cola = agregarProof([entrada('a'), entrada('b')], entrada('a', '2026-01-01T00:00:00.000Z'))
    assert.equal(cola.length, 2)
    assert.equal(cola[1].creado, '2026-01-01T00:00:00.000Z')
  })

  it('descarta entradas sin id o sin proof', () => {
    const cola = agregarProof([entrada('a')], { id: 'b' })
    assert.deepEqual(cola.map(i => i.id), ['a'])
    assert.deepEqual(agregarProof(undefined, entrada('a')).map(i => i.id), ['a'])
  })

  it('respeta el tope de la cola tirando lo más viejo', () => {
    let cola = []
    for (let i = 0; i < MAX_COLA + 5; i++) cola = agregarProof(cola, entrada(`p${i}`))
    assert.equal(cola.length, MAX_COLA)
    assert.equal(cola.at(-1).id, `p${MAX_COLA + 4}`)
    assert.equal(cola[0].id, 'p5')
  })

  it('quitar devuelve una cola sin el proof pedido', () => {
    const cola = quitarProof([entrada('a'), entrada('b')], 'a')
    assert.deepEqual(cola.map(i => i.id), ['b'])
    assert.deepEqual(quitarProof(undefined, 'a'), [])
  })
})

describe('voz: cola de proofs — intentos y caducidad', () => {
  it('marca el intento fallido con su hora', () => {
    const cola = marcarIntentoFallido([entrada('a')], 'a', { ahora: 1234 })
    assert.equal(cola[0].intentos, 1)
    assert.equal(cola[0].ultimoIntento, 1234)
  })

  it('un proof caducado o agotado no se reintenta', () => {
    const viejo = new Date(Date.now() - (MAX_DIAS + 1) * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(sigueVigente(entrada('a', viejo)), false)
    assert.equal(sigueVigente(entrada('a', new Date().toISOString(), { intentos: MAX_INTENTOS })), false)
    assert.equal(sigueVigente(entrada('a', new Date().toISOString())), true)
  })

  it('la purga deja solo lo vigente', () => {
    const viejo = new Date(Date.now() - (MAX_DIAS + 1) * 24 * 60 * 60 * 1000).toISOString()
    const cola = purgarCola([
      entrada('viejo', viejo),
      entrada('nuevo'),
      entrada('agotado', new Date().toISOString(), { intentos: MAX_INTENTOS })
    ])
    assert.deepEqual(cola.map(i => i.id), ['nuevo'])
  })

  it('pendientes conserva el orden y no toca la cola original', () => {
    const original = [entrada('a'), entrada('b')]
    const pendientes = proofsPendientes(original)
    assert.deepEqual(pendientes.map(i => i.id), ['a', 'b'])
    assert.equal(original.length, 2)
  })

  it('un proof sin fecha legible se sigue intentando', () => {
    assert.equal(sigueVigente({ id: 'a', proof: {}, creado: 'no-es-fecha' }), true)
    assert.equal(sigueVigente({}), true)
  })
})
