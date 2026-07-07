import { asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos } from '../../database/schema'
import { requireAuth } from '../../utils/auth'

/**
 * GET /api/productos
 *
 * Lista completa de productos (admin o jefe).
 */
export default defineEventHandler(async (event) => {
  const { usuario } = await requireAuth(event, 'sync')
  if (usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

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
