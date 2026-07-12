/**
 * api-offline/productos/list.js
 *
 * Lista los productos del puesto del usuario actual.
 * Espejo de server/api/productos/index.get.ts (filtro por puestoId del auth).
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {object} opts — { orderBy, orderDir, activo? }
 * @param {object} auth — { usuarioActual: { value: { puestoId } } }
 * @returns {Promise<object[]>}
 */
export async function list(opts, auth) {
  const db = useDb()
  const puestoId = auth?.usuarioActual?.value?.puestoId
  if (!puestoId) return []
  let productos
  if (opts?.activo === true) {
    productos = await db.getProductosActivos(puestoId)
  } else {
    const all = await db.queryAll('productos')
    productos = all.filter(p => p.puestoId === puestoId)
  }
  if (opts?.orderBy) {
    const dir = opts.orderDir === 'desc' ? -1 : 1
    productos.sort((a, b) => {
      const va = a[opts.orderBy] ?? ''
      const vb = b[opts.orderBy] ?? ''
      return typeof va === 'string' ? va.localeCompare(vb) * dir : (va - vb) * dir
    })
  }
  return productos.map(p => ({
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
  }))
}
