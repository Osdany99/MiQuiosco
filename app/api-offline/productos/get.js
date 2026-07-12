/**
 * api-offline/productos/get.js
 *
 * Retorna un producto por id.
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
  const p = await db.getById('productos', id)
  if (!p) return null
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    activo: p.activo,
    orden: p.orden,
    precioCompraActual: Number(p.precioCompraActual),
    precioVentaActual: Number(p.precioVentaActual),
    puestoId: p.puestoId,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn
  }
}
