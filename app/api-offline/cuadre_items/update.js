/**
 * api-offline/cuadre_items/update.js
 */
import { useDb } from '../../db-offline/client'

export async function update(id, cambios, _auth) {
  void _auth
  const db = useDb()
  const payload = { ...cambios, actualizadoEn: Date.now(), sincronizado: 0 }
  await db.update('cuadre_items', id, payload)
  return db.getById('cuadre_items', id)
}
