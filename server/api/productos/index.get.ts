import { asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

/**
 * GET /api/productos
 *
 * Lista completa de productos (solo admin).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const rows = await db
    .select({
      id: productos.id,
      puestoId: productos.puestoId,
      nombre: productos.nombre,
      descripcion: productos.descripcion,
      activo: productos.activo,
      orden: productos.orden,
      precioCompraActual: productos.precioCompraActual,
      precioVentaActual: productos.precioVentaActual,
      creadoEn: productos.creadoEn,
      actualizadoEn: productos.actualizadoEn
    })
    .from(productos)
    .orderBy(asc(productos.orden))

  return rows.map(r => ({
    id: r.id,
    puestoId: r.puestoId,
    nombre: r.nombre,
    descripcion: r.descripcion,
    activo: r.activo,
    orden: r.orden,
    precioCompraActual: Number(r.precioCompraActual),
    precioVentaActual: Number(r.precioVentaActual),
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
