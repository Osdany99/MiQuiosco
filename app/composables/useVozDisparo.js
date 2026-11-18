import { ref } from 'vue'

/**
 * useVozDisparo — señal de "abre el micrófono" para el widget/atajo/deeplink.
 *
 * Antes el auto-disparo se deduplicaba con `route.fullPath`: el segundo toque
 * del widget en la misma pantalla reenviaba la misma URL y no hacía nada. Aquí
 * cada toque incrementa un contador; `useVentaPorVoz` consume el número, no la
 * ruta. El contador se reinicia con la app, que es justo lo que queremos.
 *
 * `ruta` es la pantalla pedida por el deeplink. Se usa para no disparar en la
 * ubicación equivocada mientras el enrutador cambia de pantalla.
 */
const seq = ref(0)
const ruta = ref(null)
const ts = ref(0)

export function useVozDisparo() {
  function pedir(destino = null) {
    ruta.value = destino
    ts.value = Date.now()
    seq.value += 1
  }

  return { seq, ruta, ts, pedir }
}
