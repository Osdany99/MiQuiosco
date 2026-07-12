/**
 * api-offline/usuarios/resetPin.js
 *
 * Resetea el PIN de un usuario a un nuevo valor.
 * Espejo de server/api/usuarios/[id]/pin.patch.ts.
 */
import { useDb } from '../../db-offline/client'
import { hashPin, requireJefe } from '../../utils-offline/auth'

/**
 * @param {string} id
 * @param {object} datos — { pin: string }
 * @param {object} auth
 */
export async function resetPin(id, datos, auth) {
  requireJefe(auth)
  const db = useDb()
  const pinHash = await hashPin(datos.pin)
  await db.update('usuarios', id, {
    pinHash,
    actualizadoEn: Date.now(),
    sincronizado: 0
  })
}
