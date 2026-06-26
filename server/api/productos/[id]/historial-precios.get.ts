import { eq, desc } from 'drizzle-orm'
import { db } from '../../../database/client'
import { historialPrecios } from '../../../database/schema'
import { requireRole } from '../../../utils/auth'

/**
 * GET /api/productos/:id/historial-precios
 *
 * Historial completo de precios de un producto (solo admin).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const rows = await db
    .select({
      id: historialPrecios.id,
      productoId: historialPrecios.productoId,
      precioCompra: historialPrecios.precioCompra,
      precioVenta: historialPrecios.precioVenta,
      vigenteDesde: historialPrecios.vigenteDesde,
      vigenteHasta: historialPrecios.vigenteHasta,
      cambiadoPor: historialPrecios.cambiadoPor,
      creadoEn: historialPrecios.creadoEn
    })
    .from(historialPrecios)
    .where(eq(historialPrecios.productoId, id))
    .orderBy(desc(historialPrecios.vigenteDesde))

  return rows.map(r => ({
    id: r.id,
    productoId: r.productoId,
    precioCompra: Number(r.precioCompra),
    precioVenta: Number(r.precioVenta),
    vigenteDesde: r.vigenteDesde.toISOString(),
    vigenteHasta: r.vigenteHasta?.toISOString() ?? null,
    cambiadoPor: r.cambiadoPor,
    creadoEn: r.creadoEn.toISOString()
  }))
})
