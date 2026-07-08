import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const rows = await db
    .select({
      productoId: productos.id,
      nombreProducto: productos.nombre,
      cantidadTotal: sql<number>`sum(${cuentasFiadoItems.cantidad})`,
      deudaTotal: sql<number>`sum(${cuentasFiadoItems.subtotal})`
    })
    .from(cuentasFiadoItems)
    .innerJoin(cuentasFiado, eq(cuentasFiadoItems.cuentaFiadoId, cuentasFiado.id))
    .innerJoin(productos, eq(cuentasFiadoItems.productoId, productos.id))
    .where(sql`${cuentasFiado.estado} in ('pendiente', 'parcial')`)
    .groupBy(productos.id, productos.nombre)
    .orderBy(sql`3 desc`)
  return rows.map(r => ({
    productoId: r.productoId,
    nombreProducto: r.nombreProducto,
    cantidadTotal: Number(r.cantidadTotal),
    deudaTotal: Number(r.deudaTotal)
  }))
})
