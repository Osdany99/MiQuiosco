/**
 * api-offline/clientes/create.js
 *
 * Crea un cliente con puestoId inyectado.
 * Espejo de server/api/clientes/index.post.ts.
 */
import { useDb } from '../../db-offline/client'
import { inyectarPuestoId } from '../../utils-offline/inyectarPuestoId'

/**
 * @param {object} datos — { nombre, telefono?, notas?, activo? }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function create(datos, auth) {
  const payload = inyectarPuestoId(datos, auth)
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = useDb()
  const registro = {
    id,
    puestoId: payload.puestoId,
    nombre: payload.nombre,
    telefono: payload.telefono ?? null,
    notas: payload.notas ?? null,
    activo: payload.activo ?? true,
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('clientes', registro)
  return registro
}
