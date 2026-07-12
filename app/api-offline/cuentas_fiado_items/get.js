/**
 * api-offline/cuentas_fiado_items/get.js
 */
import { useDb } from '../../db-offline/client'

export async function get(id, _auth) {
  void _auth
  const db = useDb()
  return db.getById('cuentas_fiado_items', id)
}
