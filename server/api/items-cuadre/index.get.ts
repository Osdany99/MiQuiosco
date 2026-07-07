import { asc, eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const query = getQuery(event)
  const cuadreId = query.cuadre_id
  const rows = cuadreId
    ? await db
        .select()
        .from(cuadreItems)
        .where(eq(cuadreItems.cuadreId, String(cuadreId)))
        .orderBy(asc(cuadreItems.creadoEn))
    : await db
        .select()
        .from(cuadreItems)
        .orderBy(asc(cuadreItems.creadoEn))

  return rows.map(i => ({
    id: i.id,
    cuadreId: i.cuadreId,
    productoId: i.productoId,
    precioVentaUsado: Number(i.precioVentaUsado),
    cantidad: Number(i.cantidad),
    subtotal: Number(i.subtotal),
    tipoLinea: i.tipoLinea,
    nota: i.nota,
    esExtra: i.esExtra,
    creadoEn: i.creadoEn.toISOString(),
    actualizadoEn: i.actualizadoEn.toISOString()
  }))
})
