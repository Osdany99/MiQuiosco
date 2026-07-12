/**
 * api-offline/cuentas_fiado/list.js
 *
 * Lista las cuentas de fiado del puesto del usuario actual.
 * Espejo de server/api/cuentas-fiado/index.get.ts.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {object} opts — { orderBy, orderDir, estado?, clienteId? }
 * @param {object} auth — { usuarioActual: { value: { puestoId } } }
 * @returns {Promise<object[]>}
 */
export async function list(opts, auth) {
  const db = useDb()
  const puestoId = auth?.usuarioActual?.value?.puestoId
  if (!puestoId) return []
  const all = await db.queryAll('cuentas_fiado')
  let filtrados = all.filter(c => c.puestoId === puestoId)
  if (opts?.estado) {
    filtrados = filtrados.filter(c => c.estado === opts.estado)
  }
  if (opts?.clienteId) {
    filtrados = filtrados.filter(c => c.clienteId === opts.clienteId)
  }
  if (opts?.orderBy) {
    const dir = opts.orderDir === 'desc' ? -1 : 1
    filtrados.sort((a, b) => {
      const va = a[opts.orderBy] ?? ''
      const vb = b[opts.orderBy] ?? ''
      return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
    })
  }
  return filtrados
}
