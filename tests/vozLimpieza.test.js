import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { limpiarFrase } from '../shared/voz/limpieza.js'
import { resolverComando } from '../shared/voz/gramatica.js'

/**
 * La MISMA tabla que recorre `LimpiarVozTest` (JUnit) en el APK. Es el contrato
 * entre la limpieza de JS y la de Java: si una de las dos cambia de criterio y
 * la otra no, aquí o en el build de Android falla.
 */
const CASOS = JSON.parse(
  readFileSync(new URL('../shared/voz/limpiezaCasos.json', import.meta.url), 'utf8')
)

describe('voz: contrato de limpieza JS ↔ Java (F1b)', () => {
  it('la tabla de casos tiene al menos 30 entradas', () => {
    assert.ok(CASOS.length >= 30, `solo hay ${CASOS.length}`)
  })

  it('todas las entradas traen entrada y esperado', () => {
    const malas = CASOS.filter(c => typeof c?.entrada !== 'string' || typeof c?.esperado !== 'string')
    assert.deepEqual(malas, [])
  })

  it('limpiarFrase coincide con la tabla al 100 %', () => {
    const fallos = []
    for (const caso of CASOS) {
      const obtenido = limpiarFrase(caso.entrada).texto
      if (obtenido !== caso.esperado) fallos.push({ entrada: caso.entrada, esperado: caso.esperado, obtenido })
    }
    assert.deepEqual(fallos, [], `Casos que no coinciden:\n${JSON.stringify(fallos, null, 2)}`)
  })
})

describe('voz: limpieza de muletillas y cortesías', () => {
  it('quita el eco del wake al inicio', () => {
    assert.equal(limpiarFrase('oye nova vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('oye vende dos panes').texto, 'vende dos panes')
  })

  it('quita muletillas de borde al final', () => {
    assert.equal(limpiarFrase('vende dos panes por favor').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes gracias').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes ya').texto, 'vende dos panes')
    assert.equal(limpiarFrase('vende dos panes ahora').texto, 'vende dos panes')
  })

  it('quita cortesía tras el verbo', () => {
    assert.equal(limpiarFrase('vende por favor dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('fia por favor dos panes a juan').texto, 'fia dos panes a juan')
  })

  it('quita muletillas al inicio', () => {
    assert.equal(limpiarFrase('oye vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('mira vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('bueno vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('a ver vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('por favor vende dos panes').texto, 'vende dos panes')
  })

  it('quita tartamudeo (verbo repetido)', () => {
    assert.equal(limpiarFrase('vende vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('dame dame cinco panes').texto, 'dame cinco panes')
  })

  it('no toca nada dentro del tramo de producto', () => {
    assert.equal(limpiarFrase('pan con ya').texto, 'pan con ya')
    assert.equal(limpiarFrase('vende dos panes con ya').texto, 'vende dos panes con ya')
    assert.equal(limpiarFrase('refresco de la casa').texto, 'refresco de la casa')
  })

  it('casos reales del plan', () => {
    assert.equal(limpiarFrase('oye vende dos panes por favor').texto, 'vende dos panes')
    assert.equal(limpiarFrase('fia dos panes a juan por favor').texto, 'fia dos panes a juan')
    assert.equal(limpiarFrase('pan con ya').texto, 'pan con ya')
    assert.equal(limpiarFrase('vende vende dos panes').texto, 'vende dos panes')
  })

  it('no rompe frases limpias', () => {
    assert.equal(limpiarFrase('vende dos panes').texto, 'vende dos panes')
    assert.equal(limpiarFrase('cuanto hay de pan').texto, 'cuanto hay de pan')
    assert.equal(limpiarFrase('').texto, '')
  })

  it('devuelve quitadas no vacío cuando limpió', () => {
    const r = limpiarFrase('vende dos panes por favor')
    assert.ok(r.quitadas.length > 0)
  })

  it('devuelve quitadas vacío cuando no limpió', () => {
    const r = limpiarFrase('vende dos panes')
    assert.deepEqual(r.quitadas, [])
  })

  it('flag desactivado devuelve el texto tal cual', () => {
    const r = limpiarFrase('vende dos panes por favor', false)
    assert.equal(r.texto, 'vende dos panes por favor')
    assert.deepEqual(r.quitadas, [])
  })

  it('aplicar limpieza mejora la intención en resolverComando', () => {
    assert.equal(resolverComando('oye vende dos panes por favor').comando, 'venta_directa')
    assert.equal(resolverComando('fia dos panes a juan por favor').comando, 'venta_fiada')
  })

  it('no toca el nombre del producto cuando hay muletilla dentro', () => {
    assert.equal(limpiarFrase('vende pan con queso por favor').texto, 'vende pan con queso')
  })

  it('quita muletillas combinadas', () => {
    assert.equal(limpiarFrase('oye vende dos panes por favor ya').texto, 'vende dos panes')
  })

  it('maneja texto con un solo token', () => {
    assert.equal(limpiarFrase('hola').texto, 'hola')
  })

  it('no devuelve vacío si todo se quitó', () => {
    const r = limpiarFrase('por favor')
    assert.ok(r.texto.length > 0)
  })

  it('el flag apagado devuelve el texto intacto (F1.4)', () => {
    const entrada = 'oye vende dos panes por favor'
    const apagado = limpiarFrase(entrada, false)
    assert.equal(apagado.texto, entrada)
    assert.deepEqual(apagado.quitadas, [])
  })

  it('?vozLimpieza=0 en la URL apaga la limpieza sin tocar código', () => {
    // Rollback de emergencia en OTA: se abre el teléfono con ese query y la
    // frase vuelve a pasar cruda.
    const original = globalThis.window
    try {
      globalThis.window = { location: { search: '?vozLimpieza=0' } }
      assert.equal(limpiarFrase('oye vende dos panes por favor').texto, 'oye vende dos panes por favor')
      globalThis.window = { location: { search: '?vozLimpieza=1' } }
      assert.equal(limpiarFrase('oye vende dos panes por favor').texto, 'vende dos panes')
      // Cualquier otro valor (o ninguno) deja la constante del bundle.
      globalThis.window = { location: { search: '?otra=cosa' } }
      assert.equal(limpiarFrase('oye vende dos panes por favor').texto, 'vende dos panes')
    } finally {
      if (original === undefined) delete globalThis.window
      else globalThis.window = original
    }
  })
})
