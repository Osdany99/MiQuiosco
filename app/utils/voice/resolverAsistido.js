/**
 * app/utils/voice/resolverAsistido.js — resolución de los comandos asistidos.
 *
 * Fases K (entrada de lote), L (cambio de precio) y N (traspaso). Ninguno
 * escribe: el resolver solo elige el producto y comprueba lo que la UI necesita
 * para prellenar su formulario. Puro y testeable con `node --test`.
 *
 * Reglas comunes:
 * - Sin producto o con varios parecidos no se adivina: se devuelve `ambiguo` o
 *   `error` y la UI pregunta.
 * - El stock solo se comprueba donde importa: el traspaso saca del almacén. Una
 *   entrada no necesita stock previo y un precio no toca inventario.
 */
import { UMBRAL_PRODUCTO, decidirProducto } from '../../../shared/voz/gramatica.js'
import { crearEmparejador } from './emparejarCatalogo.js'

function sinProducto(motivo, mensaje, extras = {}) {
  return { tipo: 'error', motivo, mensaje, ...extras }
}

/**
 * Resuelve el producto de un comando asistido contra el catálogo.
 * @returns {{tipo:'ok',fila:object,efectivo:number}|{tipo:'ambiguo',candidatos:Array}|{tipo:'error',motivo:string,mensaje:string}}
 */
function resolverProducto(accion, catalogo, sttConfidence) {
  const emparejar = crearEmparejador(catalogo, sttConfidence)
  const encontrados = emparejar(accion?.slots?.productoHint ?? '')
  if (!encontrados.length) {
    return sinProducto(
      'producto_no_encontrado',
      `No encontré "${accion?.slots?.productoHint || 'ese producto'}".`
    )
  }
  const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
  if (!decision.elegido) {
    return { tipo: 'ambiguo', candidatos: encontrados, efectivo: decision.efectivo || 0 }
  }
  return { tipo: 'ok', fila: decision.elegido.row, efectivo: decision.efectivo || 0 }
}

/**
 * Entrada de lote al almacén (Fase K).
 * El costo es el dictado o, si no se dijo, el del último lote (lo resuelve el
 * diálogo al abrir: aquí no se inventa ninguna cifra).
 */
export function resolverEntradaInventario(accion, catalogo = [], { sttConfidence = 0 } = {}) {
  const resuelto = resolverProducto(accion, catalogo, sttConfidence)
  if (resuelto.tipo !== 'ok') return resuelto

  const fila = resuelto.fila
  const cantidad = Math.max(1, Math.trunc(Number(accion?.slots?.cantidad) || 1))
  const precio = Number(accion?.slots?.precioUnitario)

  return {
    tipo: 'ok',
    comando: 'entrada_inventario',
    fila,
    cantidad,
    precioUnitario: Number.isFinite(precio) && precio > 0 ? precio : null,
    efectivo: resuelto.efectivo
  }
}

/**
 * Cambio del precio de venta (Fase L). El precio es global al producto: la
 * ubicación no entra en la decisión.
 */
export function resolverCambioPrecio(accion, catalogo = [], { sttConfidence = 0 } = {}) {
  const resuelto = resolverProducto(accion, catalogo, sttConfidence)
  if (resuelto.tipo !== 'ok') return resuelto

  const fila = resuelto.fila
  const precio = Number(accion?.slots?.precio)
  if (!Number.isFinite(precio) || precio <= 0) {
    return sinProducto(
      'precio_no_dicho',
      'No oí a cuánto va el precio. Prueba: "cambia el precio del pan a 25".'
    )
  }

  return {
    tipo: 'ok',
    comando: 'cambio_precio',
    fila,
    precioActual: Number(fila?.precioVentaActual ?? 0),
    precio: precio,
    efectivo: resuelto.efectivo
  }
}

/**
 * Traspaso del almacén al quiosco (Fase N). El diálogo solo repone el quiosco:
 * el sentido contrario se rechaza con un aviso, no se invierte en silencio.
 */
export function resolverTraspaso(accion, catalogo = [], { sttConfidence = 0 } = {}) {
  if (accion?.slots?.destino === 'almacen') {
    return {
      tipo: 'aviso',
      motivo: 'traspaso_inverso',
      mensaje: 'El traspaso por voz solo va del almacén al quiosco. Para lo contrario usa el formulario.'
    }
  }

  const resuelto = resolverProducto(accion, catalogo, sttConfidence)
  if (resuelto.tipo !== 'ok') return resuelto

  const fila = resuelto.fila
  const cantidad = Math.max(1, Math.trunc(Number(accion?.slots?.cantidad) || 1))
  const disponible = Number(fila?.almacen ?? 0)

  if (cantidad > disponible) {
    return {
      tipo: 'aviso',
      motivo: 'stock_insuficiente',
      mensaje: `En el almacén solo hay ${disponible} de ${fila?.nombre}. Baja la cantidad y vuelve a dictarlo.`,
      disponible
    }
  }

  return {
    tipo: 'ok',
    comando: 'traspaso',
    fila,
    cantidad,
    disponible,
    efectivo: resuelto.efectivo
  }
}
