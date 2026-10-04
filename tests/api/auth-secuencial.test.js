/**
 * Tests de auth que necesitan ejecucion ESTRICTAMENTE SECUENCIAL.
 *
 * Motivo (doble):
 * 1. El rate limit de POST /api/auth/login es de 5 intentos por IP y ventana de
 *    60s. Los tests que lo saturan usan una IP dedicada (loginEnSerial).
 * 2. Estos tests mutan estado global (crean y desactivan usuarios), asi que
 *    todos pasan por enSerie(). `node --test --test-concurrency=1` solo
 *    controla los ARCHIVOS; los `it` de un mismo archivo siguen siendo
 *    concurrentes y se pisan entre si.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { enSerie } from './secuencial.js'
import {
  login, loginEnSerial, tokenJefe, patch, raw, mensajeDe, crearJefe, nombreUnico
} from './cliente.js'
import { restaurarJefe } from './db-directa.js'

let token

before(async () => {
  token = await tokenJefe()
  if (!token) {
    // Una corrida anterior pudo dejar al jefe del seed como 'trabajador', y el
    // trabajador no puede iniciar sesion: sin esto, todos los tests fallarian
    // en cascada con "No autenticado" sin llegar a probar nada.
    await restaurarJefe('00000000-0000-0000-0000-000000000001')
    token = await tokenJefe()
  }
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion (esta en rol jefe y activo?)')
})

// --- Anti-enumeracion (1 login) ---
describe('anti-enumeracion', () => {
  it('PIN incorrecto y usuario inexistente dan el mismo 401', () => enSerie(async () => {
    const pinMalo = await login('jefe', '9999')
    const noExiste = await login('no_existe_jamas_xyz', '1234')
    assert.equal(pinMalo.status, 401)
    assert.equal(noExiste.status, 401)
    assert.equal(
      mensajeDe(pinMalo.body),
      mensajeDe(noExiste.body),
      'el mensaje debe ser identico para no revelar que usuarios existen'
    )
  }))
})

// --- Usuario desactivado ---
describe('usuario desactivado', () => {
  it('un usuario desactivado no puede iniciar sesion', () => enSerie(async () => {
    const nombre = nombreUnico('inactivo_seq')
    const { usuario } = await crearJefe(nombre, '1234')
    // PATCH y no POST: /api/usuarios/:id solo tiene handler PATCH. Un POST cae
    // en el fallback del SPA y responde 200 con HTML, sin desactivar nada
    // (asi se enmascaro este bug de los tests durante varias corridas).
    await patch(`/api/usuarios/${usuario.id}`, { activo: false }, { token, status: 200 })
    const r = await login(nombre, '1234')
    assert.equal(r.status, 401)
    assert.equal(mensajeDe(r.body), 'Credenciales inválidas.')
  }))

  it('un token de usuario desactivado da 401 aunque el JWT sea valido', () => enSerie(async () => {
    const nombre = nombreUnico('desactiva_seq')
    const { usuario, token: t } = await crearJefe(nombre, '1234')
    const ok = await raw('GET', '/api/usuarios', { token: t })
    assert.equal(ok.status, 200, 'el token deberia funcionar mientras el usuario este activo')

    await patch(`/api/usuarios/${usuario.id}`, { activo: false }, { token, status: 200 })

    // requireAuth relee el usuario de Postgres en cada peticion (auth.ts:106),
    // asi que la desactivacion surte efecto sin esperar a que expire el JWT.
    const r = await raw('GET', '/api/usuarios', { token: t })
    assert.equal(r.status, 401)
    assert.match(mensajeDe(r.body), /no existe o est[aá] desactivado/i)
  }))
})

// --- Rate limit (satura la cuota, va al final) ---
describe('rate limit de login', () => {
  // IP fija compartida por los dos tests: la cuota se cuenta por IP, asi que el
  // segundo tiene que ver lo que consume el primero.
  const IP = '10.99.255.254'

  it('un login correcto resetea el contador', () => enSerie(async () => {
    await loginEnSerial('jefe', '0000', IP)
    await loginEnSerial('jefe', '0000', IP)
    const ok = await loginEnSerial('jefe', '1234', IP) // 200 borra la entrada (rateLimit.ts:38)
    assert.equal(ok.status, 200)
    // Con el contador reseteado, este fallo NO deberia ser 429.
    const fallo = await loginEnSerial('jefe', '0000', IP)
    assert.notEqual(fallo.status, 429, 'el 200 deberia haber reseteado la cuota')
  }))

  it('tras varios intentos fallidos seguidos aparece el 429', () => enSerie(async () => {
    // MAX_ATTEMPTS=5 con ventana de 60s. Cada 200 resetea, asi que aqui todos
    // tienen que fallar de verdad para agotar la cuota.
    const IP2 = '10.99.255.253'
    let saw429 = false
    let ultimo = null
    for (let i = 0; i < 8; i++) {
      ultimo = await loginEnSerial('jefe', '0000', IP2)
      if (ultimo.status === 429) {
        saw429 = true
        break
      }
    }
    assert.ok(saw429, 'deberia responder 429 tras agotar los intentos')
    assert.equal(ultimo.status, 429)
    assert.match(mensajeDe(ultimo.body), /demasiados intentos/i)
  }))
})
