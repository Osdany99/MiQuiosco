/**
 * api-offline/usuarios/remove.js
 *
 * Elimina un usuario local.
 * Espejo de server/api/usuarios/[id].delete.ts.
 */
import { useDb } from '../../db-offline/client'
import { requireJefe } from '../../utils-offline/auth'

/**
 * @param {string} id
 * @param {object} auth
 */
export async function remove(id, auth) {
  requireJefe(auth)
  const db = useDb()
  await db.remove('usuarios', id)
}
