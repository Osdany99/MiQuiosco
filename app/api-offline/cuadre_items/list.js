/**
 * api-offline/cuadre_items/list.js
 *
 * Lista items de cuadre, opcionalmente filtrados por cuadreId.
 * Espejo de server/api/items-cuadre/index.get.ts.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {object} opts — { cuadreId? }
 * @param {object} _auth
 * @returns {Promise<object[]>}
 */
export async function list(opts, _auth) {
  void _auth
  const db = useDb()
  const all = await db.queryAll('cuadre_items')
  if (opts?.cuadreId) {
    return all.filter(i => i.cuadreId === opts.cuadreId)
  }
  return all
}
