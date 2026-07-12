/**
 * api-offline/usuarios/get.js
 *
 * Retorna un usuario por id.
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
  const u = await db.getById('usuarios', id)
  if (!u) return null
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
