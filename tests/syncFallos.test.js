import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarRechazo,
  claveFallo,
  fallosSyncSchema,
  falloSyncSchema
} from '../shared/syncFallos.js'

describe('clasificarRechazo', () => {
  it('un 403 de puesto es fatal y aborta el push', () => {
    const r = clasificarRechazo({ statusCode: 403, statusMessage: 'otro puesto' })
    assert.equal(r.fatal, true)
    assert.equal(r.motivo, 'puesto_ajeno')
    assert.equal(r.transitorio, false)
  })

  it('un 404 (padre ausente) es transitorio', () => {
    const r = clasificarRechazo({ statusCode: 404, statusMessage: 'padre' })
    assert.equal(r.motivo, 'padre_ausente')
    assert.equal(r.transitorio, true)
    assert.equal(r.fatal, false)
  })

  it('un 422 de validación es permanente pero no fatal', () => {
    const r = clasificarRechazo({ statusCode: 422, statusMessage: 'falta pinHash' })
    assert.equal(r.motivo, 'validacion')
    assert.equal(r.transitorio, false)
    assert.equal(r.fatal, false)
  })

  it('una FK rota (23503) se reintenta; un duplicado (23505) no', () => {
    assert.equal(clasificarRechazo({ code: '23503' }).transitorio, true)
    const dup = clasificarRechazo({ code: '23505' })
    assert.equal(dup.motivo, 'duplicado')
    assert.equal(dup.transitorio, false)
  })

  it('un NOT NULL (23502) y un dato inválido (22P02) son permanentes', () => {
    assert.equal(clasificarRechazo({ code: '23502' }).transitorio, false)
    assert.equal(clasificarRechazo({ code: '22P02' }).transitorio, false)
  })

  it('un 500 o un error sin código se reintenta', () => {
    assert.equal(clasificarRechazo({ statusCode: 500 }).transitorio, true)
    assert.equal(clasificarRechazo(new Error('boom')).transitorio, true)
  })

  it('el código devuelto es el HTTP o el SQLSTATE', () => {
    assert.equal(clasificarRechazo({ statusCode: 422 }).codigo, 422)
    assert.equal(clasificarRechazo({ code: '23503' }).codigo, '23503')
  })
})

describe('claveFallo', () => {
  it('es estable e ignora el mensaje', () => {
    const a = claveFallo({ tipo: 'push_rechazo', tabla: 'productos', registroId: 'x', motivo: 'validacion', codigoHttp: 422 })
    const b = claveFallo({ tipo: 'push_rechazo', tabla: 'productos', registroId: 'x', motivo: 'validacion', codigoHttp: 422 })
    assert.equal(a, b)
  })

  it('cambia si cambia la fila o el motivo', () => {
    const base = { tipo: 'push_rechazo', tabla: 'productos', motivo: 'validacion', codigoHttp: 422 }
    assert.notEqual(
      claveFallo({ ...base, registroId: 'a' }),
      claveFallo({ ...base, registroId: 'b' })
    )
    assert.notEqual(
      claveFallo({ ...base, registroId: 'a', motivo: 'duplicado' }),
      claveFallo({ ...base, registroId: 'a' })
    )
  })
})

describe('fallosSyncSchema', () => {
  it('acepta un lote válido', () => {
    const r = fallosSyncSchema.safeParse({
      fallos: [{
        tipo: 'sync_error',
        fase: 'sync',
        codigoHttp: 500,
        mensaje: 'boom',
        ocurridoEn: Date.now(),
        contexto: { fase: 'pull' }
      }]
    })
    assert.equal(r.success, true)
  })

  it('rechaza un tipo desconocido', () => {
    assert.equal(falloSyncSchema.safeParse({ tipo: 'inventado' }).success, false)
  })

  it('limita el lote a 100 fallos', () => {
    const fallos = Array.from({ length: 101 }, () => ({ tipo: 'otro' }))
    assert.equal(fallosSyncSchema.safeParse({ fallos }).success, false)
  })
})
