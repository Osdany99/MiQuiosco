import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  MOTORES_VOZ,
  IDIOMAS_VOZ_FLOTA,
  VOZ_CONFIG_DEFECTO,
  VOZ_RETENCION_DEFECTO,
  esWakeValido,
  idiomaParaApp,
  motorParaApp,
  motorParaServicio,
  normalizarVozConfig,
  normalizarWake
} from '../shared/voz/config.js'
import { vozConfigSchema } from '../shared/schemas/vozConfig.js'

describe('voz: configuración de flota', () => {
  it('normaliza la palabra clave', () => {
    assert.equal(normalizarWake('  OYE   NOVA  '), 'oye nova')
    assert.equal(normalizarWake('"oye nova."'), 'oye nova')
    assert.equal(normalizarWake(null), '')
  })

  it('exige al menos dos palabras para no despertar con el mostrador', () => {
    assert.equal(esWakeValido('oye nova'), true)
    assert.equal(esWakeValido('hola quiosco'), true)
    assert.equal(esWakeValido('nova'), false)
    assert.equal(esWakeValido('oye'), false)
    assert.equal(esWakeValido('oye 2 nova'), false)
    assert.equal(esWakeValido(''), false)
  })

  it('rellena los valores por defecto sin lanzar', () => {
    assert.deepEqual(normalizarVozConfig(null), { ...VOZ_CONFIG_DEFECTO })
    assert.deepEqual(normalizarVozConfig({}), { ...VOZ_CONFIG_DEFECTO })
    assert.equal(normalizarVozConfig({ motor: 'inventado' }).motor, 'auto')
    assert.equal(normalizarVozConfig({ idioma: 'fr-FR' }).idioma, 'sistema')
    assert.equal(normalizarVozConfig({ version: -5 }).version, 0)
    assert.equal(normalizarVozConfig({ wake: 'nova' }).wake, 'oye nova')
  })

  it('recorta la retención al rango permitido', () => {
    assert.equal(normalizarVozConfig({ retencionDias: 1 }).retencionDias, 7)
    assert.equal(normalizarVozConfig({ retencionDias: 900 }).retencionDias, 365)
    assert.equal(normalizarVozConfig({ retencionDias: 45 }).retencionDias, 45)
    assert.equal(normalizarVozConfig({ retencionDias: '30' }).retencionDias, VOZ_RETENCION_DEFECTO)
  })

  it('traduce el motor de flota a cada contexto', () => {
    assert.equal(motorParaApp('auto'), 'automatico')
    assert.equal(motorParaApp('vosk'), 'vosk')
    assert.equal(motorParaApp('google'), 'google')
    assert.equal(motorParaServicio('auto'), 'vosk')
    assert.equal(motorParaServicio('vosk'), 'vosk')
    assert.equal(motorParaServicio('google'), 'sistema')
    assert.deepEqual(MOTORES_VOZ, ['auto', 'vosk', 'google'])
  })

  it('traduce el idioma al selector del dock', () => {
    assert.equal(idiomaParaApp('sistema'), 'sistema')
    assert.equal(idiomaParaApp('es-ES'), 'es-ES')
    assert.equal(idiomaParaApp('fr-FR'), 'sistema')
    assert.deepEqual(IDIOMAS_VOZ_FLOTA, ['sistema', 'es-US', 'es-ES', 'es-419'])
  })

  it('acepta una configuración válida y transforma la palabra clave', () => {
    const parsed = vozConfigSchema.safeParse({
      wake: '  OYE   NOVA ',
      motor: 'vosk',
      idioma: 'es-US',
      retencionDias: 30
    })
    assert.equal(parsed.success, true)
    assert.equal(parsed.data.wake, 'oye nova')
    assert.equal(parsed.data.motor, 'vosk')
  })

  it('rechaza una palabra clave de una sola palabra', () => {
    const parsed = vozConfigSchema.safeParse({
      wake: 'nova',
      motor: 'auto',
      idioma: 'sistema',
      retencionDias: 30
    })
    assert.equal(parsed.success, false)
  })

  it('rechaza motor, idioma o retención fuera de rango', () => {
    const base = { wake: 'oye nova', motor: 'auto', idioma: 'sistema', retencionDias: 30 }
    assert.equal(vozConfigSchema.safeParse({ ...base, motor: 'otro' }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, idioma: 'fr-FR' }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, retencionDias: 1 }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, retencionDias: 400 }).success, false)
    assert.equal(vozConfigSchema.safeParse({ ...base, retencionDias: 30.5 }).success, false)
  })
})
