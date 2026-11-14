/**
 * Contrato HTTP de los endpoints de voz del APK.
 *
 * El bug que motivó esta suite: `registrarProof` usaba `fetch` crudo sin
 * `Authorization`, así que `/api/voz/confirmaciones` respondía 401 siempre y la
 * tabla `voz_confirmaciones` nunca se llenaba. Aquí se fija el contrato para
 * que no vuelva a pasar.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { raw, tokenJefe } from './cliente.js'

let token

before(async () => {
  token = await tokenJefe()
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion')
})

describe('POST /api/voz/confirmaciones', () => {
  it('exige autenticacion', async () => {
    const r = await raw('POST', '/api/voz/confirmaciones', {
      body: { outcome: 'auto-confirmado' }
    })
    assert.equal(r.status, 401)
  })

  it('acepta un registro valido', async () => {
    const r = await raw('POST', '/api/voz/confirmaciones', {
      token,
      body: {
        productoNombre: 'Pan',
        cantidad: 2,
        ubicacion: 'quiosco',
        modo: 'venta',
        confianza: 0.9,
        outcome: 'auto-confirmado'
      }
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
  })

  it('rechaza un outcome desconocido', async () => {
    const r = await raw('POST', '/api/voz/confirmaciones', {
      token,
      body: { outcome: 'quizas' }
    })
    assert.equal(r.status, 400)
  })
})

describe('POST /api/voz/eventos', () => {
  it('exige autenticacion', async () => {
    const r = await raw('POST', '/api/voz/eventos', {
      body: { eventos: [{ comando: 'venta_directa', motivo: 'ok', intentos: 1 }] }
    })
    assert.equal(r.status, 401)
  })

  it('acepta un contador valido', async () => {
    const r = await raw('POST', '/api/voz/eventos', {
      token,
      body: {
        eventos: [{ comando: 'venta_directa', motivo: 'ok', confianza: 0.9, intentos: 1 }]
      }
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
  })
})

describe('GET /api/voz/lexico', () => {
  it('exige autenticacion', async () => {
    const r = await raw('GET', '/api/voz/lexico')
    assert.equal(r.status, 401)
  })

  it('devuelve el lexico con version de esquema', async () => {
    const r = await raw('GET', '/api/voz/lexico', { token })
    assert.equal(r.status, 200)
    assert.equal(r.body.schema, 1)
    assert.ok(Array.isArray(r.body.entradas))
  })
})
