/**
 * server-offline/sync/productosActivos.js
 *
 * Retorna los productos activos del puesto del usuario actual desde la DB local.
 * Espejo de server/api/sync/productos-activos.get.ts pero leyendo SQLite.
 */
import { useDb } from '../../db/client'

/**
 * @param {object} _opts — opciones (reservado para futuro)
 * @param {object} auth — { usuarioActual: { value: { puestoId } } }
 * @returns {Promise<object[]>}
 */
export async function productosActivos(_opts, auth) {
  const db = useDb()
  const puestoId = auth?.usuarioActual?.value?.puestoId
  if (!puestoId) return []
  return db.getProductosActivos(puestoId)
}
