import { watch } from 'vue'
import { useVoiceCommand } from './useVoiceCommand'
import { clasificarRespuesta } from '../utils/voice/confirmacion'
import { extraerCorreccion } from '../utils/voice/correccion'
import { esEcoDePrompt, ecoPalabraSuelta } from '../utils/voice/eco'

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
 * anuncio, se ignora y se sigue esperando.
 *
 * `ventanaMs`: durante los primeros milisegundos tras el anuncio, una palabra
 * suelta que ya estaba en el prompt («sí», «confirmar») se trata como eco. Sin
 * esto, oír solo el «sí» del anuncio confirmaba la venta sola.
 *
 * `desdeMs`: instante en que terminó el anuncio. La ventana de eco se mide
 * desde ahí y no desde la llamada: entre una cosa y otra está el arranque del
 * micrófono, y contar desde la llamada dejaba fuera un «sí» legítimo.
 *
 * Singleton: solo puede haber una conversación de confirmación a la vez.
 */

let abortarActual = null

function _create() {
  const voice = useVoiceCommand()

  function esperar({ timeoutMs = 6000, prompt = '', ventanaMs = 700, desdeMs = null } = {}) {
    return new Promise((resolve) => {
      let resuelto = false
      let timer = null
      let detener = null
      let cancelar = null
      let escuchoAlgunaVez = false
      const inicioEco = Number.isFinite(desdeMs) ? desdeMs : Date.now()

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

        const texto = String(voice.transcript?.value || voice.transcriptParcial?.value || '')
        // Antes de clasificar: el TTS puede haber entrado por el micrófono.
        if (texto && esEcoDePrompt(texto, prompt)) return

        // Una corrección («no, eran tres») gana al «no»: cambia la cantidad en
        // vez de cancelar la venta. Solo cuenta aquí, durante la confirmación.
        const correccion = extraerCorreccion(texto)
        if (correccion) return terminar('corregir', correccion.cantidad)

        const clase = clasificarRespuesta(texto)
        const reciente = Date.now() - inicioEco < ventanaMs
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
