/**
 * api-offline/usuarios/list.js
 *
 * Lista los usuarios del puesto del usuario actual.
 * Espejo de server/api/usuarios/index.get.ts (filtro por puestoId del auth).
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
  const all = await db.queryAll('usuarios')
  const filtrados = all.filter(u => u.puestoId === puestoId)
  if (opts?.orderBy) {
    const dir = opts.orderDir === 'desc' ? -1 : 1
    filtrados.sort((a, b) => {
      const va = a[opts.orderBy] ?? ''
      const vb = b[opts.orderBy] ?? ''
      return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
    })
  }
  return filtrados.map(u => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    salario: Number(u.salario),
    puestoId: u.puestoId,
    creadoEn: u.creadoEn,
    actualizadoEn: u.actualizadoEn
  }))
}
