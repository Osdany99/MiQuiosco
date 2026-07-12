/**
 * api-offline/cuadre_items/remove.js
 */
import { useDb } from '../../db-offline/client'

export async function remove(id, _auth) {
  void _auth
  const db = useDb()
  await db.remove('cuadre_items', id)
}
