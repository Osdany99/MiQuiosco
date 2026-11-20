import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACCION,
  decidirBundle,
  otaObsoleto,
  versionEnUso
} from '../shared/web/bundle.js'

const remoto = (extra = {}) => ({
  version: 23,
  apkMinima: 21,
  url: 'https://example.test/web-v23.zip',
  sha256: 'abc',
  bytes: 3200000,
  ...extra
})

describe('web: bundle OTA', () => {
  it('descarga cuando el manifiesto publica una versión más nueva', () => {
    assert.deepEqual(
      decidirBundle({ embebida: 21, instalada: 0, remoto: remoto() }),
      { accion: ACCION.DESCARGAR, version: 23 }
    )
  })

  it('no descarga si la APK ya trae esa versión o una más nueva', () => {
    assert.equal(
      decidirBundle({ embebida: 23, instalada: 0, remoto: remoto() }).accion,
      ACCION.NADA
    )
    assert.equal(
      decidirBundle({ embebida: 24, instalada: 0, remoto: remoto() }).accion,
      ACCION.NADA
    )
  })

  it('no vuelve a bajar la misma versión que ya está activa', () => {
    assert.equal(
      decidirBundle({ embebida: 21, instalada: 23, remoto: remoto() }).accion,
      ACCION.NADA
    )
  })

  it('exige actualizar la APK cuando el bundle pide una versión más nueva', () => {
    assert.equal(
      decidirBundle({ embebida: 20, instalada: 0, remoto: remoto({ apkMinima: 21 }) }).accion,
      ACCION.APK_PRIMERO
    )
  })

  it('un bundle sin apkMinima vale para cualquier APK', () => {
    assert.equal(
      decidirBundle({ embebida: 1, instalada: 0, remoto: remoto({ apkMinima: 0 }) }).accion,
      ACCION.DESCARGAR
    )
  })

  it('no reintenta una versión marcada como fallida', () => {
    assert.equal(
      decidirBundle({ embebida: 21, instalada: 0, fallida: 23, remoto: remoto() }).accion,
      ACCION.NADA
    )
    // Una versión nueva sí se intenta.
    assert.equal(
      decidirBundle({ embebida: 21, instalada: 0, fallida: 23, remoto: remoto({ version: 24 }) }).accion,
      ACCION.DESCARGAR
    )
  })

  it('ignora manifiestos incompletos', () => {
    assert.equal(decidirBundle({ embebida: 21, remoto: null }).accion, ACCION.NADA)
    assert.equal(decidirBundle({ embebida: 21, remoto: { version: 23 } }).accion, ACCION.NADA)
    assert.equal(decidirBundle({ embebida: 21, remoto: remoto({ version: 0 }) }).accion, ACCION.NADA)
  })

  it('versionEnUso devuelve la más nueva de APK y OTA', () => {
    assert.equal(versionEnUso({ embebida: 21, instalada: 0 }), 21)
    assert.equal(versionEnUso({ embebida: 21, instalada: 23 }), 23)
    assert.equal(versionEnUso({ embebida: 24, instalada: 23 }), 24)
  })

  it('otaObsoleto marca el OTA que quedó por debajo de la APK', () => {
    assert.equal(otaObsoleto({ embebida: 24, instalada: 23 }), true)
    assert.equal(otaObsoleto({ embebida: 24, instalada: 24 }), true)
    assert.equal(otaObsoleto({ embebida: 21, instalada: 23 }), false)
    assert.equal(otaObsoleto({ embebida: 21, instalada: 0 }), false)
  })
})
