/**
 * api-offline/productos/getHistorial.js
 *
 * Retorna el historial de precios de un producto, ordenado de más reciente a más antiguo.
 * Espejo de server/api/productos/[id]/historial-precios.get.ts.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {object} opts — { productoId }
 * @param {object} _auth
 * @returns {Promise<object[]>}
 */
export async function getHistorial(opts, _auth) {
  void _auth
  const db = useDb()
  const all = await db.queryAll('historial_precios')
  return all
    .filter(h => h.productoId === opts.productoId)
    .sort((a, b) => (b.vigenteDesde ?? 0) - (a.vigenteDesde ?? 0))
}
