import { generarId } from '../../../shared/inventario/operaciones.js'

/**
 * IDs idempotentes para todas las escrituras originadas por un mismo dictado.
 *
 * El mapa se reinicia al abrir un dictado nuevo, no al corregir cantidad,
 * cliente o importe. Así, dos llamadas de ejecución para la misma operación
 * reutilizan su ID, mientras que repetir conscientemente la venta con un nuevo
 * dictado crea otra operación.
 */
export function crearOperacionIds(nuevoId = generarId) {
  let ids = new Map()

  function para(clave) {
    const k = String(clave ?? '').trim()
    if (!k) throw new Error('La operación de voz necesita una clave de idempotencia.')
    if (!ids.has(k)) ids.set(k, nuevoId())
    return ids.get(k)
  }

  function reiniciar() {
    ids = new Map()
  }

  return { para, reiniciar }
}
