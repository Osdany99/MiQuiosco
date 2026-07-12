/**
 * api-offline/cuadre_items/patch.js
 */
import { update } from './update'

export async function patch(id, cambios, auth) {
  return update(id, cambios, auth)
}
