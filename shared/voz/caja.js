/**
 * shared/voz/caja.js — «cómo va la caja» por voz (puro).
 *
 * La caja sale del cuadre abierto: las líneas que el jefe ya apuntó en el
 * cuadre y los montos de fiado/transferencia del borrador. Si no hay cuadre
 * abierto se dice, en vez de inventar una cifra.
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */
import { formatearMonto } from './dia.js'

/** Forma canónica de una frase dictada: sin tildes, minúsculas y sin signos. */
function normalizarFraseVoz(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** ¿La frase pregunta por la caja del cuadre abierto? */
export function esConsultaCaja(texto) {
  const frase = normalizarFraseVoz(texto)
  if (!frase) return false
  // «cuántas cajas de leche quedan» es stock, no caja.
  if (/\b(cuesta|vale|precio|quedan?|stock|existencia|inventario)\b/.test(frase)) return false
  if (/\b(como va|como esta|cuanto hay en)\b.*\bcaja\b/.test(frase)) return true
  if (/\befectivo esperado\b/.test(frase)) return true
  return /\bcaja\b/.test(frase) && /\b(efectivo|cuadre|esperado)\b/.test(frase)
}

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/**
 * Números de la caja a partir del cuadre abierto y sus líneas.
 *
 * Misma cuenta que `useCuadre.totalEsperado` y `faltanteReal`:
 * esperado = ventas − regalo − descuento;
 * efectivo esperado = esperado − fiado − transferencias.
 *
 * Devuelve `null` si no hay cuadre abierto.
 */
export function resumirCaja({ cuadre, lineas = [] } = {}) {
  if (!cuadre || cuadre.estado !== 'abierto') return null

  let ventas = 0
  for (const linea of lineas ?? []) ventas += Number(linea?.subtotal) || 0

  const regalo = Number(cuadre.montoRegalo) || 0
  const descuento = Number(cuadre.montoDescuento) || 0
  const esperado = Math.max(0, redondear2(ventas - regalo - descuento))
  const fiado = redondear2(cuadre.montoFiado)
  const transferencia = redondear2(cuadre.montoTransferencia)
  const efectivoEsperado = redondear2(esperado - fiado - transferencia)

  return {
    fecha: cuadre.fecha ?? null,
    esperado,
    fiado,
    transferencia,
    efectivoEsperado
  }
}

/**
 * Respuesta hablada. Con dos cifras en cero la frase no se alarga: solo se
 * nombran el fiado y la transferencia cuando existen.
 */
export function formatearCaja(resumen) {
  if (!resumen) {
    return {
      titulo: 'Caja: sin cuadre abierto',
      descripcion: 'Abre el cuadre para ver la caja',
      habla: 'No hay un cuadre abierto.',
      tipo: 'caja_sin_cuadre'
    }
  }

  if (Number(resumen.efectivoEsperado) < 0) {
    return {
      titulo: 'Caja: cuadre incompleto',
      descripcion: 'Fiado o transferencias sin ventas que los respalden',
      habla: `El cuadre está incompleto: hay ${formatearMonto(-resumen.efectivoEsperado)} pesos de fiado o transferencia sin ventas que los respalden.`,
      tipo: 'caja_incompleta'
    }
  }

  const efectivo = formatearMonto(resumen.efectivoEsperado)
  const partes = []
  if (Number(resumen.fiado) > 0) partes.push(`${formatearMonto(resumen.fiado)} fiados`)
  if (Number(resumen.transferencia) > 0) {
    partes.push(`${formatearMonto(resumen.transferencia)} por transferencia`)
  }
  const cola = partes.length ? ` Descontados ${partes.join(' y ')}.` : ''

  return {
    titulo: `Caja: ${efectivo} pesos en efectivo`,
    descripcion: `${formatearMonto(resumen.esperado)} esperados`,
    habla: `En caja deberían haber ${efectivo} pesos de ${formatearMonto(resumen.esperado)} esperados.${cola}`,
    tipo: 'caja'
  }
}
