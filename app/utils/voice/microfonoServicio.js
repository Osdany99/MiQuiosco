/**
 * app/utils/voice/microfonoServicio.js — traspaso del micrófono entre el
 * servicio en primer plano y el dock.
 *
 * El servicio (app cerrada) y el dock (app abierta) usan el mismo micrófono,
 * pero viven en capas distintas: este puente evita que `useVoiceCommand`
 * importe `useVozServicio` (que a su vez importa `useVozConfig` y este, a
 * `useVoiceCommand`: un ciclo).
 *
 * Si nadie registra nada (web, tests), `liberarMicrofonoServicio()` no hace
 * nada y el dictado sigue igual.
 */

let liberador = null

/** Registra la función que pausa el servicio nativo (solo Android). */
export function registrarLiberadorMicrofono(fn) {
  liberador = typeof fn === 'function' ? fn : null
}

/**
 * Deja el micrófono libre para el dock. Es best-effort: un fallo del servicio
 * no debe impedir dictar.
 */
export async function liberarMicrofonoServicio() {
  if (!liberador) return
  try {
    await liberador()
  } catch {
    /* el servicio no respondió: se dicta igual */
  }
}
