import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDIOMAS_VOZ,
  etiquetaIdioma,
  resolverIdioma
} from '../app/utils/voice/idioma.js'

test('sistema con locale español usa el idioma del sistema explícito', () => {
  assert.equal(resolverIdioma('sistema', 'es-US'), 'es-US')
  assert.equal(resolverIdioma('sistema', 'es-ES'), 'es-ES')
})

test('sistema con locale no español cae a es-US', () => {
  assert.equal(resolverIdioma('sistema', 'en-GB'), 'es-US')
})

test('preferencia vacía equivale a sistema', () => {
  assert.equal(resolverIdioma('', 'es-US'), 'es-US')
})

test('idioma explícito se respeta', () => {
  assert.equal(resolverIdioma('es-ES', 'es-US'), 'es-ES')
  assert.equal(resolverIdioma('es-US', 'es-ES'), 'es-US')
})

test('el idioma explícito se mantiene aunque coincida con el sistema', () => {
  assert.equal(resolverIdioma('es-US', 'es-US'), 'es-US')
  assert.equal(resolverIdioma('es-ES', 'es-US'), 'es-ES')
})

test('la etiqueta muestra el locale del sistema', () => {
  assert.equal(etiquetaIdioma('sistema', 'es-US', 'es-US'), 'Sistema (es-US)')
  assert.equal(etiquetaIdioma('es-ES', 'es-ES', 'es-US'), 'es-ES')
})

test('el selector expone sistema y los idiomas soportados', () => {
  const ids = IDIOMAS_VOZ.map(opcion => opcion.id)
  assert.deepEqual(ids, ['sistema', 'es-US', 'es-ES', 'es-419'])
})
