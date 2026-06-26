import { eq, asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos } from '../../database/schema'

/**
 * GET /api/sync/productos-activos
 *
 * Devuelve solo los productos activos del catálogo, con campos reducidos:
 * - id, nombre, precioVentaActual, orden
 *
 * Deliberadamente NO incluye precio_compra, descripción ni historial.
 * Este es el único endpoint que toca el trabajador.
 *
 * Accesible sin autenticación específica — pensado para ser llamado por
 * el dispositivo del trabajador en su primer login o al actualizar el
 * catálogo. En la práctica lo más seguro es requerir un JWT de admin o
 * sync; por simplicidad inicial lo dejamos abierto (la información que
 * devuelve es pública al equipo de trabajo).
 */
export default defineEventHandler(async () => {
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
