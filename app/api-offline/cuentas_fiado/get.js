/**
 * api-offline/cuentas_fiado/get.js
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {string} id
 * @param {object} _auth
 * @returns {Promise<object|null>}
 */
export async function get(id, _auth) {
  void _auth
  const db = useDb()
  return db.getById('cuentas_fiado', id)
}
