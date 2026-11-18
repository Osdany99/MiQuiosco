import { VISTAS } from '../../../shared/permisos.js'

function formatearNumero(valor) {
  if (valor == null) return ''
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toFixed(2)))
}

/**
 * Cantidad + lo que está apartado por voz. `fila.quiosco` ya viene proyectado
 * (stock real menos pendientes), así que solo hay que explicar la diferencia.
 */
function cantidadConPendiente(valor, pendiente) {
  const base = formatearNumero(valor)
  const apartadas = Math.trunc(Number(pendiente) || 0)
  if (!apartadas) return { texto: base, habla: base }
  return {
    texto: `${base} (${apartadas} por revisar)`,
    habla: `${base}, con ${apartadas} pendientes de revisar`
  }
}

export function describirDestino(vistaKey) {
  const v = VISTAS.find(x => x.key === vistaKey)
  if (!v || !v.ruta) return null
  return { label: v.label, ruta: v.ruta }
}

export function formatearStock(fila, opciones = {}) {
  const { ubicacionPedida = null, verQuiosco = true, verAlmacen = true } = opciones || {}
  const nombre = fila?.nombre ?? ''
  const quiosco = cantidadConPendiente(fila?.quiosco, fila?.pendienteQuiosco)
  const almacen = cantidadConPendiente(fila?.almacen, fila?.pendienteAlmacen)

  if (ubicacionPedida === 'quiosco') {
    if (!verQuiosco) return { sinPermiso: true }
    return {
      sinPermiso: false,
      titulo: `${nombre} en quiosco: ${quiosco.texto}`,
      descripcion: `${nombre} en quiosco: ${quiosco.texto}`,
      habla: `${nombre} en quiosco: ${quiosco.habla}.`
    }
  }
  if (ubicacionPedida === 'almacen') {
    if (!verAlmacen) return { sinPermiso: true }
    return {
      sinPermiso: false,
      titulo: `${nombre} en almacén: ${almacen.texto}`,
      descripcion: `${nombre} en almacén: ${almacen.texto}`,
      habla: `${nombre} en almacén: ${almacen.habla}.`
    }
  }

  // Sin ubicación pedida: solo mostrar las visibles.
  if (!verQuiosco && !verAlmacen) return { sinPermiso: true }
  const partesDesc = []
  const partesHabla = []
  if (verQuiosco) {
    partesDesc.push(`Quiosco: ${quiosco.texto}`)
    partesHabla.push(`Quiosco, ${quiosco.habla}.`)
  }
  if (verAlmacen) {
    partesDesc.push(`Almacén: ${almacen.texto}`)
    partesHabla.push(`Almacén, ${almacen.habla}.`)
  }
  const desc = partesDesc.join(' · ')
  return {
    sinPermiso: false,
    titulo: nombre,
    descripcion: `${nombre} - ${desc}`,
    habla: `${nombre}. ${partesHabla.join(' ')}`
  }
}

/**
 * Precio vigente + stock del producto («cuánto cuesta el pan»).
 *
 * El precio sale del catálogo (`precioVentaActual`); no es el precio dictado de
 * una venta. Se dice también el stock para que el jefe no tenga que preguntar
 * dos veces, y se respetan los permisos de cada ubicación.
 */
export function formatearPrecio(fila, opciones = {}) {
  const { ubicacionPedida = null, verQuiosco = true, verAlmacen = true } = opciones || {}
  const nombre = fila?.nombre ?? ''
  const precioNum = Number(fila?.precioVentaActual)
  const precio = Number.isFinite(precioNum) && precioNum > 0
    ? `${formatearNumero(precioNum)} pesos`
    : null
  const quiosco = cantidadConPendiente(fila?.quiosco, fila?.pendienteQuiosco)
  const almacen = cantidadConPendiente(fila?.almacen, fila?.pendienteAlmacen)
  const inicio = precio ? `${nombre} cuesta ${precio}` : nombre

  if (ubicacionPedida === 'quiosco') {
    if (!verQuiosco) return { sinPermiso: true }
    return {
      sinPermiso: false,
      titulo: `${nombre}: ${precio ?? 'sin precio'}`,
      descripcion: `${nombre}: ${precio ?? 'sin precio'} · Quiosco: ${quiosco.texto}`,
      habla: `${inicio}. En quiosco quedan ${quiosco.habla}.`
    }
  }
  if (ubicacionPedida === 'almacen') {
    if (!verAlmacen) return { sinPermiso: true }
    return {
      sinPermiso: false,
      titulo: `${nombre}: ${precio ?? 'sin precio'}`,
      descripcion: `${nombre}: ${precio ?? 'sin precio'} · Almacén: ${almacen.texto}`,
      habla: `${inicio}. En almacén quedan ${almacen.habla}.`
    }
  }

  if (!verQuiosco && !verAlmacen) return { sinPermiso: true }
  const partesDesc = []
  const partesHabla = []
  if (verQuiosco) {
    partesDesc.push(`Quiosco: ${quiosco.texto}`)
    partesHabla.push(`En quiosco quedan ${quiosco.habla}.`)
  }
  if (verAlmacen) {
    partesDesc.push(`Almacén: ${almacen.texto}`)
    partesHabla.push(`En almacén quedan ${almacen.habla}.`)
  }
  return {
    sinPermiso: false,
    titulo: `${nombre}: ${precio ?? 'sin precio'}`,
    descripcion: `${nombre}: ${precio ?? 'sin precio'} · ${partesDesc.join(' · ')}`,
    habla: `${inicio}. ${partesHabla.join(' ')}`
  }
}
