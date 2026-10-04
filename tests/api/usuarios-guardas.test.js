/**
 * Guardas del ultimo jefe activo.
 *
 * Estos casos exigen que el puesto tenga UN SOLO jefe activo, lo que obliga a
 * suspender a todos los demas. Se hace por SQL directo y no por la API a
 * proposito: si se suspendiera por la API usando el token del jefe del seed,
 * requireAuth relee el usuario en cada peticion (auth.ts:106) y el token se
 * invalidaria a mitad del propio test, con fallos en cascada.
 *
 * Todos los tests pasan por enSerie(): mutan estado global compartido.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { enSerie } from './secuencial.js'
import { tokenJefe, get, raw, mensajeDe } from './cliente.js'
import { suspenderJefes, restaurarUsuarios, restaurarJefe } from './db-directa.js'

let token
let jefe

before(async () => {
  token = await tokenJefe()
  if (!token) {
    await restaurarJefe('00000000-0000-0000-0000-000000000001')
    token = await tokenJefe()
  }
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion')
  const usuarios = await get('/api/usuarios', { token, status: 200 })
  jefe = usuarios.find(u => u.nombre === 'jefe')
})

describe('guardas del ultimo jefe activo', () => {
  it('el jefe unico no puede quitarse su propio rol', () => enSerie(async () => {
    const ids = await suspenderJefes(jefe.id)
    try {
      const r = await raw('PATCH', `/api/usuarios/${jefe.id}`, {
        body: { rol: 'trabajador' }, token
      })
      assert.equal(r.status, 400, `esperaba 400, recibi ${r.status}`)
      assert.match(mensajeDe(r.body), /[uú]ltimo jefe/i)
    } finally {
      await restaurarJefe(jefe.id)
      await restaurarUsuarios(ids)
    }
  }))

  it('el jefe unico no puede desactivarse a si mismo', () => enSerie(async () => {
    const ids = await suspenderJefes(jefe.id)
    try {
      const r = await raw('PATCH', `/api/usuarios/${jefe.id}`, {
        body: { activo: false }, token
      })
      assert.equal(r.status, 400, `esperaba 400, recibi ${r.status}`)
      assert.match(mensajeDe(r.body), /[uú]ltimo jefe/i)
    } finally {
      await restaurarJefe(jefe.id)
      await restaurarUsuarios(ids)
    }
  }))

  it('el jefe unico no puede eliminarse', () => enSerie(async () => {
    const ids = await suspenderJefes(jefe.id)
    try {
      const r = await raw('DELETE', `/api/usuarios/${jefe.id}`, { token })
      assert.equal(r.status, 400, `esperaba 400, recibi ${r.status}`)
      assert.match(mensajeDe(r.body), /[uú]ltimo jefe/i)
    } finally {
      await restaurarJefe(jefe.id)
      await restaurarUsuarios(ids)
    }
  }))

  it('con dos jefes activos, el seed puede degradarse', () => enSerie(async () => {
    // Control positivo: la guarda no debe bloquear el caso legitimo.
    const ids = await suspenderJefes(jefe.id)
    try {
      // Se reactivan todos por SQL para tener dos jefes activos sin usar la API.
      await restaurarUsuarios([...ids, jefe.id])
      const r = await raw('PATCH', `/api/usuarios/${jefe.id}`, {
        body: { rol: 'trabajador' }, token
      })
      assert.equal(r.status, 200, `esperaba 200, recibi ${r.status}`)
      assert.equal(r.body.rol, 'trabajador')
    } finally {
      // restaurarUsuarios solo reactiva `activo`; este test ademas cambio el ROL
      // del seed a 'trabajador', y el trabajador no puede iniciar sesion. Sin
      // restaurarlo aqui, las corridas siguientes fallan con "no autenticado"
      // en cascada.
      await restaurarJefe(jefe.id)
    }
  }))
})
