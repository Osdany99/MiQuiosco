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
import { randomUUID } from 'node:crypto'
import { ipDePrueba, raw, tokenJefe } from './cliente.js'
import { revocarDispositivo } from './db-directa.js'

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

async function loginConDispositivo(dispositivoId) {
  const r = await raw('POST', '/api/auth/login', {
    body: { nombre_usuario: 'jefe', pin: '1234' },
    headers: {
      'x-dispositivo-id': dispositivoId,
      'x-forwarded-for': ipDePrueba()
    }
  })
  assert.equal(r.status, 200)
  return r.body.token
}

describe('binding JWT ↔ dispositivo en endpoints de voz', () => {
  it('un token con dispositivo no puede omitir x-dispositivo-id', async () => {
    const dispositivoId = randomUUID()
    const tokenApk = await loginConDispositivo(dispositivoId)

    const r = await raw('GET', '/api/voz/config', { token: tokenApk })
    assert.equal(r.status, 403)
    assert.match(JSON.stringify(r.body), /identificación del dispositivo/i)
  })

  it('un token con dispositivo rechaza otro equipo', async () => {
    const dispositivoId = randomUUID()
    const tokenApk = await loginConDispositivo(dispositivoId)

    const r = await raw('GET', '/api/voz/config', {
      token: tokenApk,
      headers: { 'x-dispositivo-id': randomUUID() }
    })
    assert.equal(r.status, 403)
    assert.match(JSON.stringify(r.body), /otro dispositivo/i)
  })

  it('un equipo revocado no evita el gate omitiendo el header', async () => {
    const dispositivoId = randomUUID()
    const tokenApk = await loginConDispositivo(dispositivoId)
    await revocarDispositivo(dispositivoId)

    const sinHeader = await raw('GET', '/api/voz/config', { token: tokenApk })
    assert.equal(sinHeader.status, 403)

    const conHeader = await raw('GET', '/api/voz/config', {
      token: tokenApk,
      headers: { 'x-dispositivo-id': dispositivoId }
    })
    assert.equal(conHeader.status, 403)
    assert.match(JSON.stringify(conHeader.body), /revocado/i)
  })
})
