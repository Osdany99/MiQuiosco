/**
 * api-offline/cuentas_fiado_items/patch.js
 */
import { update } from './update'

export async function patch(id, cambios, auth) {
  return update(id, cambios, auth)
}
