/**
 * api-offline/cuadres/patch.js
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
