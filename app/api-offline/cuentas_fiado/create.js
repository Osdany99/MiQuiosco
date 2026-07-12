/**
 * api-offline/cuentas_fiado/create.js
 *
 * Crea una cuenta de fiado con puestoId inyectado.
 * Espejo de server/api/cuentas-fiado/index.post.ts.
 */
import { useDb } from '../../db-offline/client'
import { inyectarPuestoId } from '../../utils-offline/inyectarPuestoId'

/**
 * @param {object} datos — { clienteId, cuadreOrigenId, montoTotal }
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
    clienteId: payload.clienteId,
    cuadreOrigenId: payload.cuadreOrigenId,
    montoTotal: payload.montoTotal,
    montoPagado: 0,
    estado: 'pendiente',
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('cuentas_fiado', registro)
  return registro
}
