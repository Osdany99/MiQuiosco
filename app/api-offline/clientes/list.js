/**
 * api-offline/clientes/list.js
 *
 * Lista los clientes del puesto del usuario actual.
 * Espejo de server/api/clientes/index.get.ts.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {object} opts — { orderBy, orderDir }
 * @param {object} auth — { usuarioActual: { value: { puestoId } } }
 * @returns {Promise<object[]>}
 */
export async function list(opts, auth) {
  const db = useDb()
  const puestoId = auth?.usuarioActual?.value?.puestoId
  if (!puestoId) return []
  const all = await db.queryAll('clientes')
  const filtrados = all.filter(c => c.puestoId === puestoId)
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
