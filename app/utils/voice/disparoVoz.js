/**
 * app/utils/voice/disparoVoz.js — condición de auto-disparo `?voice=1` (puro).
 */
export function ubicacionActiva(ruta) {
  return String(ruta || '').startsWith('/almacen') ? 'almacen' : 'quiosco'
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
  if (ubicacionActual !== ubicacionInstancia) return { accion: 'none', consumir: false }
  if (consumido === clave) return { accion: 'none', consumir: false }
  if (!disponible) {
    const mensaje = motivo && motivo !== 'Cargando…' ? motivo : null
    return { accion: 'motivo', consumir: true, clave, mensaje }
  }
  return { accion: 'disparar', consumir: true, clave }
}
