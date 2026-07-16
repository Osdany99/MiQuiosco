import { eq } from 'drizzle-orm'
import { db, schema } from '../../../database/client'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const productoId = event.context.params!.id as string

  const historiales = await db
    .select()
    .from(schema.historialPrecios)
    .where(eq(schema.historialPrecios.productoId, productoId))

  return historiales
    .sort((a, b) => (b.vigenteDesde?.getTime() ?? 0) - (a.vigenteDesde?.getTime() ?? 0))
    .map(h => ({
      id: h.id,
      productoId: h.productoId,
      precioCompra: h.precioCompra,
      precioVenta: h.precioVenta,
      vigenteDesde: h.vigenteDesde?.toISOString() ?? null,
      vigenteHasta: h.vigenteHasta?.toISOString() ?? null,
      cambiadoPor: h.cambiadoPor
    }))
})
