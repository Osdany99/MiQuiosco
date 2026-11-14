/**
 * app/utils/voice/faseVoz.js — fase visible de la interfaz de voz (puro).
 *
 * Un solo lugar decide el título, el subtítulo y el modo de la onda. Antes
 * `VoiceListeningBar` y `VoiceDock` combinaban booleanos por su cuenta y el
 * resultado parpadeaba entre «Preparando micrófono» y «Habla ahora».
 */

/** Fases del STP dentro de una escucha. Solo avanzan, nunca retroceden. */
export const FASES_STT = ['idle', 'preparando', 'capturando', 'procesando']

const ORDEN_STT = { preparando: 1, capturando: 2, procesando: 3 }

/** Avanza la fase sin volver atrás (el churn `end`/`beginning` no la mueve). */
export function avanzarFaseStt(actual, siguiente) {
  if (!(siguiente in ORDEN_STT)) return actual
  if (!(actual in ORDEN_STT)) return siguiente
  return ORDEN_STT[siguiente] >= ORDEN_STT[actual] ? siguiente : actual
}

/** Título de error según lo que de verdad falló. */
export function tituloDeError(error = '') {
  const detalle = String(error || '').toLowerCase()
  if (/servicio|no responde|desconect|conexi[oó]n|internet|red/.test(detalle)) return 'El servicio de voz falló'
  if (/no encontr[eé]/.test(detalle)) return 'No encontré el producto'
  if (/todav[ií]a no s[eé]|no entend[ií] el comando/.test(detalle)) return 'No entendí el comando'
  if (/micr[oó]fono|permiso/.test(detalle)) return 'Micrófono no disponible'
  if (/no se escuch[oó]|no te entend[ií]/.test(detalle)) return 'No te entendí'
  return 'No se pudo completar'
}

function fase(clave, titulo, subtitulo, modoOnda, puedeCancelar, extras = {}) {
  return {
    clave,
    titulo,
    subtitulo,
    modoOnda,
    puedeCancelar,
    esperandoVoz: false,
    detectando: clave === 'escucho',
    transcriptEnSubtitulo: false,
    ...extras
  }
}

/**
 * Deriva la fase visible a partir del estado del flujo, del STT y del TTS.
 * Todo son valores planos: se puede testear sin montar componentes.
 */
export function derivarFaseVoz({
  estado = 'idle',
  vozEstado = 'idle',
  faseStt = 'idle',
  hablando = false,
  confirmando = false,
  deshaciendo = false,
  cargandoModelo = false,
  error = '',
  transcript = '',
  vozDetectada = false,
  textoReciente = false
} = {}) {
  if (estado === 'error' || vozEstado === 'error') {
    return fase('error', tituloDeError(error), String(error || 'Prueba otra vez.'), 'error', false)
  }
  // Vosk tarda en cargar el modelo: que el usuario sepa que no está colgado.
  if (cargandoModelo) {
    return fase('cargando', 'Cargando el motor de voz…', 'Puede tardar unos segundos.', 'procesando', false)
  }
  if (hablando) {
    return fase('hablando', 'Hablando…', confirmando ? 'Enseguida te toca hablar' : '', 'hablando', false)
  }
  if (deshaciendo) {
    return fase('deshacer', 'Puedes deshacer', 'Di «cancela» para anular la venta.', 'escuchando', true)
  }

  const capturando = faseStt === 'capturando'
  const preparando = faseStt === 'preparando'
  const procesando = faseStt === 'procesando'
    || estado === 'interpretando'
    || estado === 'registrando'
  const detecta = Boolean(vozDetectada || textoReciente)

  if (confirmando) {
    if (capturando) {
      return fase(
        detecta ? 'escucho' : 'turno',
        detecta ? 'Te escucho' : 'Habla ahora',
        'Di «sí» para confirmar o «no» para cancelar',
        'escuchando',
        true,
        { esperandoVoz: !detecta, detectando: detecta }
      )
    }
    return fase('confirmar', 'Preparando confirmación…', 'Espera un momento…', 'procesando', false)
  }
  if (estado === 'ambiguo') {
    return fase('ambiguo', 'Elige un producto', '', 'idle', false)
  }
  if (estado === 'listo') {
    return fase('listo', 'Listo para confirmar', '', 'idle', false)
  }
  if (procesando) {
    return fase(
      'procesando',
      'Procesando lo que dijiste…',
      transcript || 'Un momento…',
      'procesando',
      false,
      { transcriptEnSubtitulo: Boolean(transcript) }
    )
  }
  if (capturando) {
    return fase(
      detecta ? 'escucho' : 'turno',
      detecta ? 'Te escucho' : 'Habla ahora',
      transcript || 'Por ejemplo: «vender dos refrescos»',
      'escuchando',
      true,
      { esperandoVoz: !detecta, detectando: detecta, transcriptEnSubtitulo: Boolean(transcript) }
    )
  }
  if (preparando || estado === 'preparando' || estado === 'escuchando') {
    return fase('preparando', 'Preparando micrófono…', 'Espera un momento…', 'procesando', true)
  }
  return fase('idle', 'Escuchando…', '', 'idle', false)
}
