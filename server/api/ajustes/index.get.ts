import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ajustes, usuarios, productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const conditions = []

  if (query.cuadre_id || query.cuadreId) {
    conditions.push(eq(ajustes.cuadreId, String(query.cuadre_id || query.cuadreId)))
  }
  if (query.tipo) {
    const t = String(query.tipo)
    if (t === 'regalo' || t === 'descuento') {
      conditions.push(eq(ajustes.tipo, sql`${t}::tipo_ajuste`))
    }
  }
  if (query.clienteId) {
    conditions.push(eq(ajustes.clienteId, String(query.clienteId)))
  }

  const rows = await db
    .select({
      id: ajustes.id,
      clienteId: ajustes.clienteId,
      nombreCliente: usuarios.nombre,
      cuadreId: ajustes.cuadreId,
      productoId: ajustes.productoId,
      nombreProducto: productos.nombre,
      tipo: ajustes.tipo,
      cantidad: ajustes.cantidad,
      monto: ajustes.monto,
      nota: ajustes.nota,
      creadoEn: ajustes.creadoEn,
      actualizadoEn: ajustes.actualizadoEn
    })
    .from(ajustes)
    .leftJoin(usuarios, eq(ajustes.clienteId, usuarios.id))
    .innerJoin(productos, eq(ajustes.productoId, productos.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ajustes.creadoEn))

  return rows.map(r => ({
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    cuadreId: r.cuadreId,
    productoId: r.productoId,
    nombreProducto: r.nombreProducto,
    tipo: r.tipo,
    cantidad: r.cantidad,
    monto: r.monto,
    nota: r.nota,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
