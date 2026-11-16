import { VISTAS } from '#shared/permisos'

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
