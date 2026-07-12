/**
 * api-offline/pagos_fiado/patch.js
 */
import { update } from './update'

export async function patch(id, cambios, auth) {
  return update(id, cambios, auth)
}
