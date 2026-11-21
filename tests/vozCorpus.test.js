import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolverComando } from '../shared/voz/gramatica.js'

const corpus = JSON.parse(readFileSync(new URL('../shared/voz/corpus.json', import.meta.url), 'utf8'))

test('corpus: toda frase no marcada como fallo conocido coincide en comando', () => {
  const fallos = []
  for (const entrada of corpus) {
    if (entrada.conocido_fallo) continue
    const r = resolverComando(entrada.texto)
    if (r.comando !== entrada.comando) {
      fallos.push({ texto: entrada.texto, esperado: entrada.comando, obtenido: r.comando })
    }
  }
  assert.deepEqual(fallos, [], `Frases que fallan:\n${JSON.stringify(fallos, null, 2)}`)
})

test('corpus: las marcadas como fallo conocido que ya pasan deben desmarcarse', () => {
  // El corpus solo avanza: si una frase marcada ya acierta, la marca sobra y
  // hay que quitarla. Si no, el corpus acabaría ocultando regresiones.
  const yaPasan = corpus
    .filter(e => e.conocido_fallo && resolverComando(e.texto).comando === e.comando)
    .map(e => e.texto)
  assert.deepEqual(yaPasan, [], `Quitar \`conocido_fallo\` de: ${JSON.stringify(yaPasan, null, 2)}`)
})

test('corpus: las frases reales de producción están como regresión', () => {
  // Las 43 frases dictadas en «Quiosco juana» (2026-11-19 → 21). Las que
  // estaban mal siguen aquí: son las que vigilan P1 y P2.
  const reales = [
    'cuanto gane ayer',
    'cuanto me gane ayer',
    'pasa 10 azucar al kiosco',
    'pasa 30 huevos para el kiosco',
    'pasa 7 azucar al kiosco',
    'pasa 10 azucar para el kiosco',
    'envia 10 azucar del almacen al kiosco',
    'lleva 10 azucar para el kiosco',
    'vende dos mani',
    'vende 12 toallitas',
    'vende un bocadito',
    'cuanto me gane hoy',
    'cambia el precio de las javas a 20',
    'pon la azucar a 580',
    'cual es el precio del azucar',
    'entrada 165 azucar a 500',
    'dime el precio del detergente',
    'cual es el precio del mantecado',
    'pon el refresco debajo del huevo'
  ]
  const textos = new Set(corpus.map(e => e.texto))
  const faltan = reales.filter(t => !textos.has(t))
  assert.deepEqual(faltan, [], `Faltan en el corpus: ${JSON.stringify(faltan, null, 2)}`)
})
