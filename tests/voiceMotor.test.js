import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTORES_CATALOGO,
  OPCIONES_MOTOR,
  resolverPreferencia
} from '../app/utils/voice/engines/catalogo.js'

test('automatico con internet usa Google online', () => {
  const seleccion = resolverPreferencia('automatico', true)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, false)
})

test('automatico sin internet usa Google offline', () => {
  const seleccion = resolverPreferencia('automatico', false)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, true)
})

test('automatico con conexión desconocida asume online', () => {
  const seleccion = resolverPreferencia('automatico', null)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, false)
})

test('google online primero', () => {
  const seleccion = resolverPreferencia('google', false)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, false)
})

test('google offline primero', () => {
  const seleccion = resolverPreferencia('google-offline', true)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, true)
})

test('vosk solo se usa si se selecciona', () => {
  const seleccion = resolverPreferencia('vosk', true)
  assert.equal(seleccion.id, 'vosk')
  assert.equal(seleccion.offline, true)
})

test('solo Vosk requiere preparación', () => {
  assert.equal(resolverPreferencia('google', true).requierePreparacion, false)
  assert.equal(resolverPreferencia('google-offline', false).requierePreparacion, false)
  assert.equal(resolverPreferencia('vosk', true).requierePreparacion, true)
  assert.equal(resolverPreferencia('automatico', true).requierePreparacion, false)
})

test('preferencia desconocida cae a automatico', () => {
  const seleccion = resolverPreferencia('cualquiera', false)
  assert.equal(seleccion.id, 'google')
  assert.equal(seleccion.offline, true)
})

test('el selector expone automatico y las opciones de los motores', () => {
  const ids = OPCIONES_MOTOR.map(opcion => opcion.id)
  assert.deepEqual(ids, ['automatico', 'google', 'google-offline', 'vosk'])
  assert.equal(MOTORES_CATALOGO.length, 2)
})
