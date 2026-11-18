import { watch } from 'vue'
import { useVoiceCommand } from './useVoiceCommand'
import { clasificarRespuesta } from '../utils/voice/confirmacion'
import { extraerCorreccion } from '../utils/voice/correccion'
import { esEcoDePrompt, respuestaTrasEco } from '../utils/voice/eco'

/**
 * useConfirmacionVoz — espera única para las confirmaciones habladas.
 *
 * Resuelve `{ resultado, cantidad }`:
 * - `resultado`: `'afirmado' | 'negado' | 'corregir' | 'timeout' | 'error'`.
 * - `cantidad`: solo viene con `'corregir'` («no, eran tres»).
 *
 * `cancelar()` aborta la espera en curso (resuelve `'timeout'`).
 *
 * `prompt`: TODO lo que dijo el TTS (la lectura completa, no solo la pregunta).
 * Es la única forma de detectar el eco: si el micrófono devuelve el final del
 * anuncio, se ignora y se sigue esperando. Si el anuncio y la respuesta llegan
 * pegados («diga sí para confirmar sí»), se responde con lo que sobra.
 *
 * `desdeMs`: instante en que terminó el anuncio. Se conserva por compatibilidad
 * con quien llama; la espera ya no descarta respuestas cortas por llegar
 * pronto: un «sí» dicho al terminar el anuncio es la respuesta esperada.
 *
 * Singleton: solo puede haber una conversación de confirmación a la vez.
 */

let abortarActual = null

function _create() {
  const voice = useVoiceCommand()

  function esperar({ timeoutMs = 6000, prompt = '', desdeMs = null } = {}) {
    return new Promise((resolve) => {
      let resuelto = false
      let timer = null
      let detener = null
      let cancelar = null
      let escuchoAlgunaVez = false
      void desdeMs

      const terminar = (resultado, cantidad = null) => {
        if (resuelto) return
        resuelto = true
        if (timer) clearTimeout(timer)
        if (abortarActual === cancelar) abortarActual = null
        try {
          detener?.()
        } catch {
          /* noop */
        }
        resolve({ resultado, cantidad })
      }

      /** Texto a analizar: el dictado limpio de eco. `''` si solo se oyó el anuncio. */
      const limpiar = (crudo) => {
        const t = String(crudo ?? '').trim()
        if (!t) return ''
        return respuestaTrasEco(t, prompt) || t
      }

      const revisar = () => {
        const estado = voice.estado.value
        if (estado === 'listening') escuchoAlgunaVez = true

        const texto = String(voice.transcript?.value || voice.transcriptParcial?.value || '').trim()

        // Alternativas del motor con confianza suficiente. Solo se usan como
        // respaldo si la transcripción principal no da una respuesta clara.
        const alternativas = Array.isArray(voice.alternativas?.value)
          ? voice.alternativas.value
              .filter(a => !a?.confianza || Number(a.confianza) >= 0.5)
              .slice(0, 3)
              .map(a => String(a?.texto ?? a?.text ?? ''))
          : []

        // La transcripción principal manda. Las alternativas solo se miran si
        // la principal no da una respuesta clara: un «sí» espurio del N-best no
        // puede confirmar la venta por su cuenta.
        const principal = limpiar(texto)
        if (principal && !esEcoDePrompt(principal, prompt)) {
          // Una corrección («no, eran tres») gana al «no»: cambia la cantidad
          // en vez de cancelar la venta. Solo cuenta durante la confirmación.
          const correccion = extraerCorreccion(principal)
          if (correccion) return terminar('corregir', correccion.cantidad)

          const clase = clasificarRespuesta(principal)
          if (clase === 'negado') return terminar('negado')
          if (clase === 'afirmado') return terminar('afirmado')
        }

        // El motor puede acertar en una alternativa y fallar en la principal
        // («se» en vez de «sí»). Sin corrección: cambiar cantidades a partir de
        // una hipótesis es demasiado arriesgado.
        for (const alternativa of alternativas) {
          const candidato = limpiar(alternativa)
          if (!candidato || esEcoDePrompt(candidato, prompt)) continue
          const clase = clasificarRespuesta(candidato)
          if (clase === 'negado') return terminar('negado')
          if (clase === 'afirmado') return terminar('afirmado')
        }

        if (estado === 'error') return terminar('error')
        // La escucha terminó sin una respuesta reconocible: no se espera al
        // tope de 6 s, que dejaría al jefe hablando solo. Solo cuenta si antes
        // llegó a escuchar: al arrancar, el motor pasa por 'ready'/idle.
        if (escuchoAlgunaVez && estado === 'ready') return terminar('timeout')
      }

      cancelar = () => terminar('timeout')
      abortarActual = cancelar
      // El timer va ANTES de observar y de revisar: si `revisar()` resolvía de
      // inmediato (transcript ya presente), quedaba un setTimeout colgado 6 s.
      timer = setTimeout(() => terminar('timeout'), timeoutMs)
      detener = watch(
        [() => voice.transcript?.value, () => voice.transcriptParcial?.value, () => voice.estado.value],
        revisar
      )
      revisar()
    })
  }

  function cancelar() {
    abortarActual?.()
  }

  return { esperar, cancelar }
}

let singleton = null

export function useConfirmacionVoz() {
  if (!singleton) singleton = _create()
  return singleton
}
