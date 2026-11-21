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
  const yaPasan = corpus.filter(e => e.conocido_fallo && resolverComando(e.texto).comando === e.comando)
  // No falla, solo informa: el corpus solo avanza.
  console.log(`conocido_fallo que ya pasan: ${yaPasan.length}`)
  assert.ok(true)
})
