/**
 * api-offline/cuentas_fiado_items/update.js
 */
import { useDb } from '../../db-offline/client'

export async function update(id, cambios, _auth) {
  void _auth
  const db = useDb()
  const payload = { ...cambios, sincronizado: 0 }
  await db.update('cuentas_fiado_items', id, payload)
  return db.getById('cuentas_fiado_items', id)
}
