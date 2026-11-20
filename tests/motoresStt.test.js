import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTORES_STT,
  normalizarMotorStt,
  motorEfectivo,
  motorDeServicio,
  etiquetaMotorStt
} from '../shared/voz/motoresStt.js'

describe('motores STT: normalización', () => {
  it('acepta solo los motores conocidos', () => {
    for (const motor of MOTORES_STT) {
      assert.equal(normalizarMotorStt(motor), motor)
    }
  })

  it('descarta vacíos y valores desconocidos', () => {
    assert.equal(normalizarMotorStt(''), null)
    assert.equal(normalizarMotorStt(null), null)
    assert.equal(normalizarMotorStt(undefined), null)
    assert.equal(normalizarMotorStt('whisper'), null)
    assert.equal(normalizarMotorStt('sistema'), null)
  })
})

describe('motores STT: motor efectivo del dock', () => {
  it('Vosk se registra como vosk sin importar la conexión', () => {
    assert.equal(motorEfectivo({ motorVoz: 'vosk', modo: 'online' }), 'vosk')
    assert.equal(motorEfectivo({ motorVoz: 'vosk', modo: 'offline' }), 'vosk')
  })

  it('Google se parte en online/offline según el modo', () => {
    assert.equal(motorEfectivo({ motorVoz: 'google', modo: 'offline' }), 'google-offline')
    assert.equal(motorEfectivo({ motorVoz: 'google', modo: 'online' }), 'google-online')
    // Modo desconocido: el catálogo asume online (ver resolverPreferencia).
    assert.equal(motorEfectivo({ motorVoz: 'google' }), 'google-online')
  })

  it('el navegador se registra como web', () => {
    assert.equal(motorEfectivo({ motorVoz: 'web' }), 'web')
    assert.equal(motorEfectivo({ backend: 'web' }), 'web')
  })

  it('sin motor no inventa uno', () => {
    assert.equal(motorEfectivo(), null)
    assert.equal(motorEfectivo({ motorVoz: 'automatico' }), null)
  })
})

describe('motores STT: motor del servicio en primer plano', () => {
  it('Vosk se conserva', () => {
    assert.equal(motorDeServicio('vosk'), 'vosk')
  })

  it('el reconocedor del sistema es siempre Google en línea', () => {
    assert.equal(motorDeServicio('sistema'), 'google-online')
    assert.equal(motorDeServicio('google'), 'google-online')
  })

  it('un valor ya normalizado pasa igual', () => {
    assert.equal(motorDeServicio('google-offline'), 'google-offline')
    assert.equal(motorDeServicio('web'), 'web')
  })

  it('vacío o desconocido se descarta', () => {
    assert.equal(motorDeServicio(''), null)
    assert.equal(motorDeServicio(null), null)
    assert.equal(motorDeServicio('otro'), null)
  })
})

describe('motores STT: etiqueta', () => {
  it('traduce los motores conocidos', () => {
    assert.equal(etiquetaMotorStt('vosk'), 'Vosk (offline)')
    assert.equal(etiquetaMotorStt('google-offline'), 'Google (sin conexión)')
    assert.equal(etiquetaMotorStt('google-online'), 'Google (en línea)')
    assert.equal(etiquetaMotorStt('web'), 'Navegador')
  })

  it('sin motor muestra un guion y conserva lo desconocido', () => {
    assert.equal(etiquetaMotorStt(null), '—')
    assert.equal(etiquetaMotorStt(''), '—')
    assert.equal(etiquetaMotorStt('experimental'), 'experimental')
  })
})
