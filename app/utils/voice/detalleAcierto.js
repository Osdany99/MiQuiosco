import { nombreCompleto } from './fuzzyMatchProducts.js'

/**
 * Detalle legible de una acción de voz para el diagnóstico de aciertos.
 *
 * Puro: no depende de Vue ni de Capacitor, así que se prueba con `node --test`.
 * No inventa datos: solo reúne lo que la acción ya resolvió (producto, cantidad,
 * cliente, importe, posición) en una línea corta para el panel.
 */

/**
 * Acciones que cuentan como «acierto». Quedan fuera los avisos, errores,
 * ambigüedades, falta de stock y cancelaciones: esos ya van a `voz_eventos`.
 */
export const ACCIONES_ACIERTO = Object.freeze(new Set([
  'venta',
  'venta_multiple',
  'fiar',
  'cobrar',
  'deuda_dinero',
  'transferencia_cuadre',
  'entrada',
  'cambio_precio',
  'traspaso',
  'ajuste',
  'producto_alta',
  'cliente_alta',
  'mover',
  'cuadre',
  'consultar_stock',
  'consultar_precio',
  'consultar_deuda',
  'consultar_dia',
  'consultar_ganancia',
  'consultar_caja',
  'repetir',
  'ayuda'
]))

function limpio(valor) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim()
}

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

const ETIQUETA_TIPO_VENTA = {
  familiar: 'familiar',
  casa: 'casa',
  regalo: 'regalo'
}

export function detalleDeAccion(accion) {
  if (!accion || typeof accion !== 'object') return null
  const partes = []

  const fila = accion.fila || accion.producto || null
  const producto = limpio(nombreCompleto(fila?.nombre || accion.nombre, fila?.descripcion || accion.descripcion))
  const cantidad = numero(accion.cantidad ?? accion.slots?.cantidad)
  if (producto) partes.push(cantidad && cantidad > 1 ? `${cantidad} × ${producto}` : producto)
  else if (cantidad && cantidad > 1) partes.push(`${cantidad} u.`)

  if (accion.tipo === 'venta_multiple' && Array.isArray(accion.lineas)) {
    const lineas = accion.lineas
      .map((l) => {
        const nom = limpio(nombreCompleto(l.fila?.nombre || l.productoHint || 'producto', l.fila?.descripcion || l.descripcion))
        return `${numero(l.cantidad) || 1} × ${nom || 'producto'}`
      })
      .join(', ')
    if (lineas) partes.push(lineas)
  }

  const tipoVenta = limpio(accion.tipoVenta || accion.slots?.tipoVenta || accion.prefill?.tipoVenta)
  const etiquetaTipo = ETIQUETA_TIPO_VENTA[tipoVenta]
  if (etiquetaTipo) partes.push(etiquetaTipo)

  const cliente = limpio(accion.cliente?.nombre || accion.slots?.clienteHint)
  if (cliente) partes.push(`cliente: ${cliente}`)

  const importe = numero(accion.importe ?? accion.monto ?? accion.precio ?? accion.precioUnitario)
  if (importe != null) partes.push(`importe: ${importe}`)

  if (accion.tipo === 'mover') {
    const posicion = numero(accion.indice)
    const referencia = limpio(accion.referencia?.nombre)
    if (posicion != null) {
      partes.push(referencia ? `posición ${posicion + 1}, tras ${referencia}` : `posición ${posicion + 1}`)
    }
  }
  if (accion.ajusteTipo) partes.push(limpio(accion.ajusteTipo))
  if (accion.tipo === 'cuadre' && accion.slots?.accion) partes.push(limpio(accion.slots.accion))
  if (accion.motivo) partes.push(limpio(accion.motivo))

  // Si no hay nada mejor, al menos el ámbito de una consulta de deuda.
  if (!partes.length && limpio(accion.ambito)) partes.push(limpio(accion.ambito))

  return partes.filter(Boolean).join(' · ').slice(0, 200) || null
}
