import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MS_VENTANA_ECO_CONFIRMACION,
  evaluarRespuestaConfirmacion
} from '../app/utils/voice/confirmacion.js'

const PROMPT = 'Voy a vender 2 unidades de Pan del almacén por 20 pesos. Diga sí para confirmar o no para cancelar.'
const BASE = {
  estado: 'ready',
  prompt: PROMPT,
  desdeMs: 1_000,
  ahoraMs: 5_000,
  escuchoAlgunaVez: true
}

function evaluar(cambios = {}) {
  return evaluarRespuestaConfirmacion({ ...BASE, ...cambios })
}

describe('confirmación hablada segura: solo resultado final', () => {
  it('un «sí» durante la escucha nunca confirma', () => {
    assert.equal(evaluar({ estado: 'listening', textoFinal: 'sí' }), null)
  })

  it('un «no» parcial no cancela antes de oír la corrección', () => {
    assert.equal(evaluar({ estado: 'listening', textoFinal: 'no' }), null)
    assert.deepEqual(evaluar({ textoFinal: 'no, eran tres' }), {
      resultado: 'corregir',
      cantidad: 3
    })
  })

  it('«sí… pero no» final no confirma', () => {
    assert.deepEqual(evaluar({ textoFinal: 'sí pero no' }), {
      resultado: 'timeout',
      cantidad: null
    })
  })

  it('una alternativa afirmativa durante la escucha tampoco decide', () => {
    assert.equal(evaluar({
      estado: 'listening',
      textoFinal: '',
      alternativas: [{ texto: 'sí', confianza: 0.99 }]
    }), null)
  })
})

describe('confirmación hablada segura: antieco', () => {
  it('un «sí» suelto dentro de la ventana de eco no confirma', () => {
    const resultado = evaluar({
      textoFinal: 'sí',
      ahoraMs: 1_000 + MS_VENTANA_ECO_CONFIRMACION - 1
    })
    assert.notEqual(resultado?.resultado, 'afirmado')
  })

  it('un «sí» humano fuera de la ventana sí confirma', () => {
    assert.deepEqual(evaluar({
      textoFinal: 'sí',
      ahoraMs: 1_000 + MS_VENTANA_ECO_CONFIRMACION
    }), { resultado: 'afirmado', cantidad: null })
  })

  it('el anuncio completo nunca confirma aunque llegue tarde', () => {
    const resultado = evaluar({ textoFinal: 'diga sí para confirmar' })
    assert.notEqual(resultado?.resultado, 'afirmado')
  })

  it('rescata una respuesta humana pegada al final del anuncio', () => {
    assert.deepEqual(evaluar({ textoFinal: 'diga sí para confirmar sí' }), {
      resultado: 'afirmado',
      cantidad: null
    })
  })

  it('no destruye una afirmación corta que comparte palabras con el prompt', () => {
    assert.deepEqual(evaluar({ textoFinal: 'sí por favor' }), {
      resultado: 'afirmado',
      cantidad: null
    })
  })

  it('un «no» humano fuera de la ventana cancela', () => {
    assert.deepEqual(evaluar({ textoFinal: 'no' }), {
      resultado: 'negado',
      cantidad: null
    })
  })
})

describe('confirmación hablada segura: alternativas y cierre', () => {
  it('rechaza alternativas con confianza cero o ausente', () => {
    const resultado = evaluar({
      textoFinal: 'no sé',
      alternativas: [
        { texto: 'sí', confianza: 0 },
        { texto: 'sí' }
      ]
    })
    assert.notEqual(resultado?.resultado, 'afirmado')
  })

  it('acepta una alternativa final con confianza suficiente si la principal no decide', () => {
    assert.deepEqual(evaluar({
      textoFinal: 'no sé',
      alternativas: [{ texto: 'sí', confianza: 0.8 }]
    }), { resultado: 'afirmado', cantidad: null })
  })

  it('un resultado final desconocido deja el flujo en modo manual', () => {
    assert.deepEqual(evaluar({ textoFinal: 'mañana' }), {
      resultado: 'timeout',
      cantidad: null
    })
  })

  it('propaga error y cancelación sin esperar al tope externo', () => {
    assert.deepEqual(evaluar({ estado: 'error' }), { resultado: 'error', cantidad: null })
    assert.deepEqual(evaluar({ estado: 'cancelled' }), { resultado: 'timeout', cantidad: null })
  })

  it('sigue esperando si el motor cerró antes de que la espera observara escucha', () => {
    assert.equal(evaluar({ textoFinal: '', escuchoAlgunaVez: false }), null)
  })
})
