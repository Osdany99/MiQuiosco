/**
 * Rate limit en endpoints WebAuthn (S6).
 *
 * Antes del fix, server/middleware/rateLimit.ts solo cubria POST
 * /api/auth/login con match exacto: los 6 endpoints WebAuthn (todos con PIN
 * adivinable de 4-6 digitos) eran superficie de fuerza bruta sin limite.
 * Ahora el middleware cubre POST /api/auth/* con cuota por IP+RUTA.
 *
 * Paralelo-seguro: cada test usa su IP dedicada (la cuota es por IP+ruta).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { raw, mensajeDe } from './cliente.js'

async function postAuth(path, body, ip) {
  return raw('POST', path, {
    body,
    headers: { 'x-forwarded-for': ip }
  })
}

describe('rate limit en WebAuthn', () => {
  it('register-options con PIN malo repetido da 429', async () => {
    const ip = '10.99.250.1'
    let ultimo = null
    for (let i = 0; i < 8; i++) {
      ultimo = await postAuth(
        '/api/auth/webauthn/register-options',
        { nombre_usuario: 'jefe', pin: '0000' },
        ip
      )
      // Los primeros intentos son 401 (PIN malo), no 429 todavia.
      if (i === 0) assert.equal(ultimo.status, 401)
      if (ultimo.status === 429) break
    }
    assert.equal(ultimo.status, 429, 'deberia limited tras agotar la cuota')
    assert.match(mensajeDe(ultimo.body), /demasiados intentos/i)
  })

  it('login-options con usuario inexistente repetido da 429', async () => {
    const ip = '10.99.250.2'
    let ultimo = null
    for (let i = 0; i < 8; i++) {
      ultimo = await postAuth(
        '/api/auth/webauthn/login-options',
        { nombre_usuario: 'no_existe_webauthn' },
        ip
      )
      if (i === 0) assert.equal(ultimo.status, 401)
      if (ultimo.status === 429) break
    }
    assert.equal(ultimo.status, 429, 'deberia limited tras agotar la cuota')
  })

  it('las cuotas son por ruta: saturar register no bloquea login', async () => {
    // La clave es IP+ruta: un atacante bloqueado en un endpoint no bloquea a
    // un usuario legitimo en otro (y los tests no se contaminan entre si).
    const ipReg = '10.99.250.3'
    const ipLogin = '10.99.250.3'
    for (let i = 0; i < 6; i++) {
      await postAuth(
        '/api/auth/webauthn/register-options',
        { nombre_usuario: 'jefe', pin: '0000' },
        ipReg
      )
    }
    const r = await postAuth(
      '/api/auth/login',
      { nombre_usuario: 'jefe', pin: '1234' },
      ipLogin
    )
    // El login con PIN correcto en OTRA ruta no se ve afectado por la cuota
    // agotada de register-options.
    assert.equal(r.status, 200)
  })
})
