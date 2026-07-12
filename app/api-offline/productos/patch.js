/**
 * api-offline/productos/patch.js
 *
 * Actualización parcial. Misma lógica de detección de cambio de precio que update.js.
 */
import { update } from './update'

/**
 * @param {string} id
 * @param {object} cambios
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function patch(id, cambios, auth) {
  // Reutilizamos update.js porque la lógica es idéntica (detección de cambio de precio)
  return update(id, cambios, auth)
}
