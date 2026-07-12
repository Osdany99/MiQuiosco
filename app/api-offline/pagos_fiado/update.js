/**
 * api-offline/pagos_fiado/update.js
 */
import { useDb } from '../../db-offline/client'

export async function update(id, cambios, _auth) {
  void _auth
  const db = useDb()
  const payload = { ...cambios, sincronizado: 0 }
  await db.update('pagos_fiado', id, payload)
  return db.getById('pagos_fiado', id)
}
