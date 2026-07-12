/**
 * api-offline/cuentas_fiado_items/remove.js
 */
import { useDb } from '../../db-offline/client'

export async function remove(id, _auth) {
  void _auth
  const db = useDb()
  await db.remove('cuentas_fiado_items', id)
}
