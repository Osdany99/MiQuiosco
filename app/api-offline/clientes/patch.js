/**
 * api-offline/clientes/patch.js
 *
 * Actualización parcial de un cliente.
 */
import { update } from './update'

/**
 * @param {string} id
 * @param {object} cambios
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function patch(id, cambios, auth) {
  return update(id, cambios, auth)
}
