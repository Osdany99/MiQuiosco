import { VISTAS } from '#shared/permisos'

function formatearNumero(valor) {
  if (valor == null) return ''
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toFixed(2)))
}

export function describirDestino(vistaKey) {
  const v = VISTAS.find(x => x.key === vistaKey)
  if (!v || !v.ruta) return null
  return { label: v.label, ruta: v.ruta }
}

export function formatearStock(fila, opciones = {}) {
  const { ubicacionPedida = null, verQuiosco = true, verAlmacen = true } = opciones || {}
  const nombre = fila?.nombre ?? ''
  const quiosco = fila?.quiosco
  const almacen = fila?.almacen

  if (ubicacionPedida === 'quiosco') {
    if (!verQuiosco) return { sinPermiso: true }
    const cantidad = formatearNumero(quiosco)
    return {
      sinPermiso: false,
      titulo: `${nombre} en quiosco: ${cantidad}`,
      descripcion: `${nombre} en quiosco: ${cantidad}`,
      habla: `${nombre} en quiosco: ${cantidad}.`
    }
  }
  if (ubicacionPedida === 'almacen') {
    if (!verAlmacen) return { sinPermiso: true }
    const cantidad = formatearNumero(almacen)
    return {
      sinPermiso: false,
      titulo: `${nombre} en almacén: ${cantidad}`,
      descripcion: `${nombre} en almacén: ${cantidad}`,
      habla: `${nombre} en almacén: ${cantidad}.`
    }
  }

  // Sin ubicación pedida: solo mostrar las visibles.
  if (!verQuiosco && !verAlmacen) return { sinPermiso: true }
  const partesDesc = []
  const partesHabla = []
  if (verQuiosco) {
    const c = formatearNumero(quiosco)
    partesDesc.push(`Quiosco: ${c}`)
    partesHabla.push(`Quiosco, ${c}.`)
  }
  if (verAlmacen) {
    const c = formatearNumero(almacen)
    partesDesc.push(`Almacén: ${c}`)
    partesHabla.push(`Almacén, ${c}.`)
  }
  const desc = partesDesc.join(' · ')
  return {
    sinPermiso: false,
    titulo: nombre,
    descripcion: `${nombre} — ${desc}`,
    habla: `${nombre}. ${partesHabla.join(' ')}`
  }
}
