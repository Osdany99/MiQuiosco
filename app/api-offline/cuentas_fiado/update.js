/**
 * api-offline/cuentas_fiado/update.js
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
  await db.update('cuentas_fiado', id, payload)
  return db.getById('cuentas_fiado', id)
}
