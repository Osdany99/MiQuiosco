import { and, eq, asc } from 'drizzle-orm'
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
  const auth = await requireAuth(event, 'sync')
  const rows = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      precioVentaActual: productos.precioVentaActual,
      orden: productos.orden
    })
    .from(productos)
    // Sin el filtro descargaba el catalogo de TODOS los puestos.
    .where(and(eq(productos.activo, true), eq(productos.puestoId, auth.usuario.puestoId)))
    .orderBy(asc(productos.orden))

  return rows.map(r => ({
    id: r.id,
    nombre: r.nombre,
    precioVentaActual: r.precioVentaActual,
    orden: r.orden
  }))
})
