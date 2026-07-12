/**
 * api-offline/cuadres/update.js
 *
 * Actualización total de un cuadre.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {string} id
 * @param {object} cambios
 * @param {object} _auth
 * @returns {Promise<object>}
 */
export async function update(id, cambios, _auth) {
  void _auth
  const db = useDb()
  const payload = { ...cambios, actualizadoEn: Date.now(), sincronizado: 0 }
  await db.update('cuadres', id, payload)
  return db.getById('cuadres', id)
}
