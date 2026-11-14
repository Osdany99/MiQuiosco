import { watch } from 'vue'
import { useVoiceCommand } from './useVoiceCommand'
import { clasificarRespuesta } from '../utils/voice/confirmacion'

/**
 * useConfirmacionVoz — espera única para las confirmaciones habladas.
 *
 * Antes había dos implementaciones casi iguales: `esperarRespuestaVoz` en
 * `layouts/default.vue` (Modo PRO) y `esperarConfirmacionVoz` en
 * `useVentaPorVoz` (venta directa). Esta es la única.
 *
 * Resuelve: 'afirmado' | 'negado' | 'timeout' | 'error'.
 * `cancelar()` aborta la espera en curso (resuelve 'timeout').
 *
 * Singleton: solo puede haber una conversación de confirmación a la vez.
 */

let abortarActual = null

function _create() {
  const voice = useVoiceCommand()

  function esperar({ timeoutMs = 5000 } = {}) {
    return new Promise((resolve) => {
      let resuelto = false
      let timer = null
      let detener = null
      let cancelar = null

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
        const texto = String(voice.transcript?.value || voice.transcriptParcial?.value || '')
        const clase = clasificarRespuesta(texto)
        if (clase === 'negado') return terminar('negado')
        if (clase === 'afirmado') return terminar('afirmado')
        if (voice.estado.value === 'error') return terminar('error')
        // La escucha terminó sin una respuesta reconocible.
        if (voice.estado.value === 'ready') return terminar('timeout')
      }

      cancelar = () => terminar('timeout')
      abortarActual = cancelar
      detener = watch(
        [() => voice.transcript?.value, () => voice.transcriptParcial?.value, () => voice.estado.value],
        revisar
      )
      timer = setTimeout(() => terminar('timeout'), timeoutMs)
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
