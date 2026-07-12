/**
 * api-offline/productos/remove.js
 *
 * Elimina un producto local.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {string} id
 * @param {object} _auth
 */
export async function remove(id, _auth) {
  void _auth
  const db = useDb()
  await db.remove('productos', id)
}
