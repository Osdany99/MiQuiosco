import { eq, asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos } from '../../database/schema'
import { requireAuth } from '../../utils/auth'

/**
 * GET /api/sync/productos-activos
 *
 * Devuelve solo los productos activos del catálogo, con campos reducidos:
 * - id, nombre, precioVentaActual, orden
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event, 'sync')
  const rows = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      precioVentaActual: productos.precioVentaActual,
      orden: productos.orden
    })
    .from(productos)
    .where(eq(productos.activo, true))
    .orderBy(asc(productos.orden))

  return rows.map(r => ({
    id: r.id,
    nombre: r.nombre,
    precio_venta_actual: Number(r.precioVentaActual),
    orden: r.orden
  }))
})
