import { watch } from 'vue'
import { useVoiceCommand } from './useVoiceCommand'
import { clasificarRespuesta } from '../utils/voice/confirmacion'
import { esEcoDePrompt, ecoPalabraSuelta } from '../utils/voice/eco'

/**
 * useConfirmacionVoz — espera única para las confirmaciones habladas.
 *
 * Resuelve: 'afirmado' | 'negado' | 'timeout' | 'error'.
 * `cancelar()` aborta la espera en curso (resuelve 'timeout').
 *
 * `prompt`: TODO lo que dijo el TTS (la lectura completa, no solo la pregunta).
 * Es la única forma de detectar el eco: si el micrófono devuelve el final del
 * anuncio, se ignora y se sigue esperando.
 *
 * `ventanaMs`: durante los primeros milisegundos tras abrir el micrófono, una
 * palabra suelta que ya estaba en el prompt («sí», «confirmar») se trata como
 * eco. Sin esto, oír solo el «sí» del anuncio confirmaba la venta sola.
 *
 * Singleton: solo puede haber una conversación de confirmación a la vez.
 */

let abortarActual = null

function _create() {
  const voice = useVoiceCommand()

  function esperar({ timeoutMs = 5000, prompt = '', ventanaMs = 700 } = {}) {
    return new Promise((resolve) => {
      let resuelto = false
      let timer = null
      let detener = null
      let cancelar = null
      let escuchoAlgunaVez = false
      const inicio = Date.now()

      const terminar = (valor) => {
        if (resuelto) return
        resuelto = true
        if (timer) clearTimeout(timer)
        if (abortarActual === cancelar) abortarActual = null
        try {
          detener?.()
        } catch {
          /* noop */
        }
        resolve(valor)
      }

      const revisar = () => {
        const estado = voice.estado.value
        if (estado === 'listening') escuchoAlgunaVez = true

        const texto = String(voice.transcript?.value || voice.transcriptParcial?.value || '')
        // Antes de clasificar: el TTS puede haber entrado por el micrófono.
        if (texto && esEcoDePrompt(texto, prompt)) return

        const clase = clasificarRespuesta(texto)
        const reciente = Date.now() - inicio < ventanaMs
        // Al principio de la escucha, algo que el propio anuncio decía no es
        // una respuesta del jefe (típico: solo se oyó el «sí» final).
        if (reciente && clase !== 'vacio' && texto && ecoPalabraSuelta(texto, prompt)) return

        if (clase === 'negado') return terminar('negado')
        if (clase === 'afirmado') return terminar('afirmado')
        if (estado === 'error') return terminar('error')
        // La escucha terminó sin respuesta reconocible. Solo cuenta si antes
        // llegó a escuchar: al arrancar, el motor pasa por 'ready'/idle.
        if (escuchoAlgunaVez && estado === 'ready') return terminar('timeout')
      }

      cancelar = () => terminar('timeout')
      abortarActual = cancelar
      // El timer va ANTES de observar y de revisar: si `revisar()` resolvía de
      // inmediato (transcript ya presente), quedaba un setTimeout colgado 5 s.
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
