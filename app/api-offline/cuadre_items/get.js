/**
 * api-offline/cuadre_items/get.js
 */
import { useDb } from '../../db-offline/client'

export async function get(id, _auth) {
  void _auth
  const db = useDb()
  return db.getById('cuadre_items', id)
}
