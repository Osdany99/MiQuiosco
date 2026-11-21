import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_EXTENSIONES_ESCUCHA,
  MS_ESCUCHA_COLGANTE,
  MS_ESCUCHA_COMPLETA,
  MS_TEXTO_ESTABLE,
  decidirVigilancia,
  limiteEscuchaTexto,
  pareceIncompleta
} from '../app/utils/voice/vigilancia.js'

describe('voz: el silencio depende de cómo va la frase (P12)', () => {
  describe('pareceIncompleta', () => {
    it('una frase con forma completa no está a medias', () => {
      assert.equal(pareceIncompleta('vende dos panes'), false)
      assert.equal(pareceIncompleta('fía dos panes a Juan'), false)
      assert.equal(pareceIncompleta('pasa 10 azúcar al kiosco'), false)
    })

    it('terminar en preposición, artículo o conjunción sí lo está', () => {
      for (const colgante of ['de', 'del', 'con', 'y', 'al', 'para', 'a', 'el', 'la', 'un', 'los', 'las']) {
        assert.equal(pareceIncompleta(`vende dos panes ${colgante}`), true, colgante)
      }
    })

    it('la palabra suelta también cuenta', () => {
      assert.equal(pareceIncompleta('y'), true)
      assert.equal(pareceIncompleta('de'), true)
    })

    it('no le importan mayúsculas, tildes ni puntuación', () => {
      assert.equal(pareceIncompleta('Vende dos panes DEL'), true)
      assert.equal(pareceIncompleta('vende dos panes de.'), true)
      assert.equal(pareceIncompleta('  vende dos panes   para  '), true)
    })

    it('un parcial vacío no es una frase a medias', () => {
      assert.equal(pareceIncompleta(''), false)
      assert.equal(pareceIncompleta('   '), false)
      assert.equal(pareceIncompleta(null), false)
      assert.equal(pareceIncompleta(undefined), false)
    })

    it('una palabra que solo contiene la preposición no engaña', () => {
      assert.equal(pareceIncompleta('vende dos panes de ajo'), false)
      assert.equal(pareceIncompleta('vende dos panes de leche'), false)
      assert.equal(pareceIncompleta('vende dos panes y una leche'), false)
    })
  })

  describe('limiteEscuchaTexto', () => {
    it('sin dato de forma conserva los 1200 ms de siempre', () => {
      assert.equal(limiteEscuchaTexto({}), MS_TEXTO_ESTABLE)
      assert.equal(limiteEscuchaTexto(), MS_TEXTO_ESTABLE)
    })

    it('una frase completa se cierra antes que hoy', () => {
      assert.equal(limiteEscuchaTexto({ terminaEnPalabraColgante: false }), MS_ESCUCHA_COMPLETA)
      assert.ok(MS_ESCUCHA_COMPLETA < MS_TEXTO_ESTABLE)
    })

    it('una frase a medias espera mientras queden extensiones', () => {
      for (let usadas = 0; usadas < MAX_EXTENSIONES_ESCUCHA; usadas++) {
        assert.equal(
          limiteEscuchaTexto({ terminaEnPalabraColgante: true, extensionesUsadas: usadas }),
          MS_ESCUCHA_COLGANTE,
          `extensión ${usadas}`
        )
      }
    })

    it('agotadas las extensiones se cierra como antes', () => {
      assert.equal(
        limiteEscuchaTexto({ terminaEnPalabraColgante: true, extensionesUsadas: MAX_EXTENSIONES_ESCUCHA }),
        MS_TEXTO_ESTABLE
      )
      assert.equal(
        limiteEscuchaTexto({ terminaEnPalabraColgante: true, extensionesUsadas: 99 }),
        MS_TEXTO_ESTABLE
      )
    })

    it('un límite explícito manda sobre la forma de la frase', () => {
      assert.equal(
        limiteEscuchaTexto({ terminaEnPalabraColgante: true, limites: { textoEstable: 500 } }),
        500
      )
    })
  })

  describe('decidirVigilancia', () => {
    it('una frase completa cierra a 1000 ms y no antes', () => {
      assert.equal(
        decidirVigilancia({ hayTexto: true, desdeTextoMs: 999, terminaEnPalabraColgante: false }),
        'esperar'
      )
      assert.equal(
        decidirVigilancia({ hayTexto: true, desdeTextoMs: 1000, terminaEnPalabraColgante: false }),
        'terminar'
      )
    })

    it('«vende dos panes de» sigue esperando a los 1200 ms de hoy', () => {
      assert.equal(
        decidirVigilancia({ hayTexto: true, desdeTextoMs: MS_TEXTO_ESTABLE, terminaEnPalabraColgante: true }),
        'esperar'
      )
      assert.equal(
        decidirVigilancia({
          hayTexto: true,
          desdeTextoMs: MS_ESCUCHA_COLGANTE - 1,
          terminaEnPalabraColgante: true
        }),
        'esperar'
      )
      assert.equal(
        decidirVigilancia({ hayTexto: true, desdeTextoMs: MS_ESCUCHA_COLGANTE, terminaEnPalabraColgante: true }),
        'terminar'
      )
    })

    it('con las extensiones agotadas cierra a los 1200 ms', () => {
      assert.equal(
        decidirVigilancia({
          hayTexto: true,
          desdeTextoMs: MS_TEXTO_ESTABLE,
          terminaEnPalabraColgante: true,
          extensionesUsadas: MAX_EXTENSIONES_ESCUCHA
        }),
        'terminar'
      )
    })

    it('sin texto sigue avisando por el tope de silencio', () => {
      assert.equal(decidirVigilancia({ hayTexto: false, desdeReadyMs: 99_999 }), 'sin_voz')
    })

    it('una escucha que ya se está cerrando no decide nada', () => {
      assert.equal(
        decidirVigilancia({ hayTexto: true, desdeTextoMs: 99_999, finalizando: true }),
        'esperar'
      )
    })
  })

  describe('tope de extensiones en una escucha real', () => {
    it('dos parciales colgantes alargan; el tercero vuelve al cierre normal', () => {
      // Simula lo que hace `marcarParcial`: concede espera larga mientras
      // queden extensiones y luego deja de conceder.
      let extensiones = 0
      const limites = []
      for (let i = 0; i < 4; i++) {
        const limite = limiteEscuchaTexto({
          terminaEnPalabraColgante: true,
          extensionesUsadas: extensiones
        })
        limites.push(limite)
        if (limite === MS_ESCUCHA_COLGANTE) {
          extensiones = Math.min(extensiones + 1, MAX_EXTENSIONES_ESCUCHA)
        }
      }
      assert.deepEqual(limites.slice(0, 2), [MS_ESCUCHA_COLGANTE, MS_ESCUCHA_COLGANTE])
      assert.deepEqual(limites.slice(2), [MS_TEXTO_ESTABLE, MS_TEXTO_ESTABLE])
    })
  })
})
