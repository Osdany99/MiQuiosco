import { watch } from 'vue'
import { useVoiceCommand } from './useVoiceCommand'
import { evaluarRespuestaConfirmacion } from '../utils/voice/confirmacion'

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
 * Solo se evalúa el resultado final (`ready`), nunca un parcial. `desdeMs` es
 * el instante en que terminó el anuncio y delimita la ventana en la que un
 * «sí/no» suelto puede ser todavía el eco del propio TTS.
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

      const revisar = () => {
        const estado = voice.estado.value
        if (estado === 'listening') escuchoAlgunaVez = true

        // transcriptParcial queda fuera deliberadamente: «sí… pero no» no debe
        // confirmar en el primer parcial y «no, eran tres» no debe cancelar en
        // el segundo. El evaluador puro también bloquea el eco del propio TTS.
        const respuesta = evaluarRespuestaConfirmacion({
          estado,
          textoFinal: voice.transcript?.value || '',
          alternativas: voice.alternativas?.value || [],
          prompt,
          desdeMs,
          escuchoAlgunaVez
        })
        if (respuesta) return terminar(respuesta.resultado, respuesta.cantidad)
      }

      cancelar = () => terminar('timeout')
      abortarActual = cancelar
      // El timer va ANTES de observar y de revisar: si `revisar()` resolvía de
      // inmediato (transcript ya presente), quedaba un setTimeout colgado 6 s.
      timer = setTimeout(() => terminar('timeout'), timeoutMs)
      detener = watch(
        [() => voice.transcript?.value, () => voice.estado.value],
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
