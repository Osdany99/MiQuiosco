/**
 * app/utils/voice/resolverVenta.js — decisión de una venta por voz (puro).
 *
 * Separa "qué hay que hacer" de "hacerlo": recibe los slots ya interpretados y
 * el catálogo, y devuelve una acción plana. No abre diálogos, no habla, no
 * escribe ni toca estado de Vue. `useVentaPorVoz.ejecutar()` consume el
 * resultado.
 *
 * Sin Vue y sin red: se prueba con `node --test` (tests/vozResolver.test.js).
 *
 * Acciones:
 *   { tipo: 'venta', modo: 'directa' | 'formulario', ... }
 *   { tipo: 'ambiguo', candidatos, slots, sttConfidence }
 *   { tipo: 'stock', mensaje, disponible, fila, destino }
 *   { tipo: 'aviso', motivo: 'ubicacion_conflicto', mensaje, ubicacion }
 *   { tipo: 'error', motivo, mensaje }
 */
import {
  UMBRAL_PRODUCTO,
  decidirProducto,
  preferirHintConTipo,
  resolverUbicacion
} from '../../../shared/voz/gramatica.js'
import { crearEmparejador } from './emparejarCatalogo.js'
import { fraseStockInsuficiente } from './frasesVoz.js'

function etiquetaUbicacion(ubicacion) {
  return ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
}

/**
 * @param {object} opciones
 * @param {object} opciones.slots Slots validados de `voiceCommandSchema`.
 * @param {Array} opciones.catalogo Filas de inventario (ambas ubicaciones).
 * @param {number} opciones.sttConfidence Confianza del STT (0..1).
 * @param {boolean} opciones.ventaDirecta Resolución para el buzón (app cerrada).
 */
export function resolverVenta({
  slots,
  catalogo = [],
  sttConfidence = 0,
  ventaDirecta = false
} = {}) {
  // Sin ubicación explícita la venta sale del ALMACÉN (también en /quiosco).
  const destino = resolverUbicacion(slots)

  const emparejar = crearEmparejador(catalogo, sttConfidence)
  let encontrados = emparejar(slots?.productoHint)

  // "vende un refresco familiar": ¿"familiar" es el tipo de venta o parte del
  // nombre? Si existe un producto con ese nombre exacto, gana el producto.
  if (slots?.alternativaTipo) {
    const alterna = emparejar(slots.alternativaTipo.productoHint)
    if (preferirHintConTipo(alterna)) {
      encontrados = alterna
      slots.productoHint = slots.alternativaTipo.productoHint
      slots.tipoVenta = slots.alternativaTipo.tipoVenta
    }
  }

  if (!encontrados.length) {
    return {
      tipo: 'error',
      comando: 'venta_directa',
      motivo: 'producto_no_encontrado',
      mensaje: `No encontré "${slots?.productoHint || 'ese producto'}".`,
      texto: slots?.productoHint || '',
      sttConfidence,
      encontrados: 0,
      catalogoTotal: catalogo.length
    }
  }

  const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
  if (!decision.elegido) {
    return {
      tipo: 'ambiguo',
      candidatos: encontrados,
      slots,
      sttConfidence,
      encontrados: encontrados.length,
      efectivo: decision.efectivo || 0
    }
  }

  const fila = decision.elegido.row
  const lugar = etiquetaUbicacion(destino.ubicacion)
  const disponible = Number(fila?.[destino.ubicacion] ?? 0)
  const cantidad = Math.max(1, Math.trunc(Number(slots?.cantidad) || 1))

  if (cantidad > disponible) {
    return {
      tipo: 'stock',
      comando: 'venta_directa',
      motivo: 'stock_insuficiente',
      mensaje: fraseStockInsuficiente({ disponible, nombre: fila?.nombre, lugar }),
      texto: slots?.productoHint || '',
      disponible,
      fila,
      destino,
      slots,
      sttConfidence,
      encontrados: encontrados.length,
      efectivo: decision.efectivo || 0
    }
  }

  // El precio depende del tipo: casa y familiar salen al costo (el lote más
  // reciente), regalo no cobra y la venta directa usa el de catálogo. El
  // precio dictado ("vende 2 panes a 10") manda sobre todos: es lo que se
  // acordó con el cliente.
  const tipoVenta = slots?.tipoVenta || 'directa'
  const precioDictado = slots?.precioUnitario != null && Number(slots.precioUnitario) > 0
  const precioUnitario = precioDictado
    ? Number(slots.precioUnitario)
    : tipoVenta === 'regalo'
      ? 0
      : (tipoVenta === 'casa' || tipoVenta === 'familiar')
          ? Number(fila?.costoActual ?? 0)
          : Number(fila?.precioVentaActual ?? 0)
  const importe = Math.round(precioUnitario * cantidad * 100) / 100
  const modoDirecta = Boolean(ventaDirecta) && tipoVenta === 'directa'

  return {
    tipo: 'venta',
    modo: modoDirecta ? 'directa' : 'formulario',
    slots,
    fila,
    destino,
    sttConfidence,
    cantidad,
    disponible,
    precioUnitario,
    precioDictado,
    tipoVenta,
    importe,
    encontrados: encontrados.length,
    efectivo: decision.efectivo || 0
  }
}
