/**
 * api-offline/usuarios/update.js
 *
 * Actualiza un usuario (reemplazo total). Hashea el PIN si viene en el payload.
 * Espejo de server/api/usuarios/[id].put.ts.
 */
import { useDb } from '../../db-offline/client'
import { hashPin, requireJefe } from '../../utils-offline/auth'

/**
 * @param {string} id
 * @param {object} cambios — { nombre?, rol?, pin?, activo?, salario? }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function update(id, cambios, auth) {
  requireJefe(auth)
  const db = useDb()
  const payload = { ...cambios }
  if (payload.pin) {
    payload.pinHash = await hashPin(payload.pin)
    delete payload.pin
  }
  payload.actualizadoEn = Date.now()
  payload.sincronizado = 0
  await db.update('usuarios', id, payload)
  const u = await db.getById('usuarios', id)
  return {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    salario: Number(u.salario),
    puestoId: u.puestoId,
    creadoEn: u.creadoEn,
    actualizadoEn: u.actualizadoEn
  }
}
