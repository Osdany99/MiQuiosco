import { asc, eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiadoItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const query = getQuery(event)
  const cuentaFiadoId = query.cuenta_fiado_id
  const rows = cuentaFiadoId
    ? await db
        .select()
        .from(cuentasFiadoItems)
        .where(eq(cuentasFiadoItems.cuentaFiadoId, String(cuentaFiadoId)))
        .orderBy(asc(cuentasFiadoItems.creadoEn))
    : await db
        .select()
        .from(cuentasFiadoItems)
        .orderBy(asc(cuentasFiadoItems.creadoEn))

  return rows.map(i => ({
    id: i.id,
    cuentaFiadoId: i.cuentaFiadoId,
    productoId: i.productoId,
    cantidad: Number(i.cantidad),
    precioVentaUsado: Number(i.precioVentaUsado),
    subtotal: Number(i.subtotal),
    creadoEn: i.creadoEn.toISOString()
  }))
})
