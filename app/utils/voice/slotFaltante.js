/**
 * app/utils/voice/slotFaltante.js — qué le falta a un comando para ejecutarse (puro).
 *
 * «vende pan» no dice cuántos: el intérprete asume 1 y sigue. Con el formulario
 * abierto da igual, el jefe escribe la cantidad. Pero en cero toques —donde la
 * voz es el único canal— vender 1 pan por omisión es peligroso: el jefe dijo
 * «vende pan» y el sistema eligió por él.
 *
 * Aquí se decide SI falta algo y QUÉ preguntar. No escucha ni habla: solo mira
 * el comando, los slots y el texto dictado.
 *
 * Reglas (F4.1 del plan):
 * - venta / fiado: falta la cantidad si el dictado **no trae ningún número**;
 * - cobro: falta el monto si se dijo «cobra a Juan» sin cifra;
 * - lo demás: no pregunta nada.
 *
 * Puro (sin Vue ni Capacitor): se prueba con `node --test`.
 */
import { parseNumberSequence } from '../../../shared/voz/gramatica.js'

/** Máximo de preguntas por comando, como pide el plan. */
export const MAX_PREGUNTAS = 2

/** Frase que se dice cuando ya no se pregunta más. */
export const FRASE_NO_ANOTADO = 'No la anoté.'

/** Números en palabras que cuenta como cantidad dicha. */
const UNIDADES = /\b(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|docena|docenas|media)\b/

/**
 * ¿El dictado trae un número? Se mira el texto, no el slot: «vende pan» deja
 * `cantidad: 1` por defecto, indistinguible de «vende un pan».
 */
export function traeNumero(texto) {
  const plano = String(texto ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!plano) return false
  if (/\d/.test(plano)) return true
  if (UNIDADES.test(plano)) return true
  return Boolean(parseNumberSequence(plano.split(' ').filter(Boolean)))
}

/**
 * ¿Qué le falta a este comando?
 *
 * @param {string} comando
 * @param {object} slots slots ya validados por `voiceCommandSchema`
 * @param {string} texto lo que se dictó, tal cual
 * @returns {{falta: 'cantidad'|'monto', pregunta: string}|null}
 */
export function decidirSlotFaltante(comando, slots, texto) {
  const dicho = String(texto ?? '')

  if (comando === 'venta_directa' || comando === 'venta_fiada') {
    if (traeNumero(dicho)) return null
    return { falta: 'cantidad', pregunta: '¿Cuántos?' }
  }

  if (comando === 'cobro_deuda') {
    // `monto: 'todo'` es una decisión deliberada del intérprete («cobra la
    // deuda de Juan»). Solo se pregunta cuando además el dictado no lo dijo:
    // «cobra a Juan» no dice ni cuánto ni que sea todo.
    if (slots?.monto === 'todo' && !/\btodo\b|\bdeuda\b/.test(dicho)) {
      return { falta: 'monto', pregunta: '¿Cuánto?' }
    }
    if (slots?.monto == null) return { falta: 'monto', pregunta: '¿Cuánto?' }
    return null
  }

  return null
}

/**
 * Interpreta la respuesta a «¿Cuántos?» / «¿Cuánto?».
 *
 * Acepta la forma suelta («tres», «200») y la corrección hablada
 * («no, eran tres», «pon seis»), reutilizando `extraerCorreccion`.
 *
 * @param {string} texto
 * @returns {{valor: number}|null}
 */
export function parsearRespuestaSlot(texto) {
  const plano = String(texto ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!plano) return null

  const tokens = plano.split(' ').filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const secuencia = parseNumberSequence(tokens.slice(i))
    if (!secuencia || !secuencia.consumidos) continue
    const valor = Math.trunc(Number(secuencia.valor) || 0)
    if (valor >= 1 && valor <= 9999) return { valor }
  }

  // Sin número no hay cantidad. «no», «ya», «nada» cierran la pregunta.
  return null
}
