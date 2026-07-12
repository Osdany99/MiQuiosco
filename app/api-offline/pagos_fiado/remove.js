/**
 * api-offline/pagos_fiado/remove.js
 */
import { useDb } from '../../db-offline/client'

export async function remove(id, _auth) {
  void _auth
  const db = useDb()
  await db.remove('pagos_fiado', id)
}
