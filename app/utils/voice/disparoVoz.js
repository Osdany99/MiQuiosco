/**
 * app/utils/voice/disparoVoz.js — condición de auto-disparo `?voice=1` (puro).
 *
 * El auto-disparo (widget/atajo) solo tiene sentido en inventario. El dock
 * manual sí es global; ver `app/layouts/default.vue`.
 */
export function ubicacionActiva(ruta) {
  const r = String(ruta || '')
  if (r.startsWith('/almacen')) return 'almacen'
  if (r.startsWith('/inventario')) return 'almacen'
  if (r.startsWith('/quiosco')) return 'quiosco'
  return null
}

/** ¿La ruta es una vista de inventario (quiosco o almacén)? */
export function esRutaInventario(ruta) {
  return ubicacionActiva(ruta) !== null
}

export function evaluarDisparoVoz({
  query,
  configLista,
  ubicacionActual,
  ubicacionInstancia,
  consumido,
  disponible,
  motivo,
  clave
}) {
  const q = Array.isArray(query) ? query[0] : query
  if (q !== '1') return { accion: 'none', consumir: false }
  if (!configLista) return { accion: 'esperar', consumir: false }
  if (!ubicacionActual) return { accion: 'none', consumir: false }
  if (ubicacionActual !== ubicacionInstancia) return { accion: 'none', consumir: false }
  if (consumido === clave) return { accion: 'none', consumir: false }
  if (!disponible) {
    const mensaje = motivo && motivo !== 'Cargando…' ? motivo : null
    return { accion: 'motivo', consumir: true, clave, mensaje }
  }
  return { accion: 'disparar', consumir: true, clave }
}
