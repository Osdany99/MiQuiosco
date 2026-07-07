import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems, cuadres, productos, historialPrecios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

/**
 * GET /api/graficas/productos-mayor-ganancia?desde=&hasta=
 *
 * Top 10 productos por ganancia total (cantidad × (precio_venta_usado - precio_compra_vigente)).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado')
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  // Query compleja: necesitamos el precio de compra vigente en la fecha del cuadre
  // Usamos subquery para obtener historial_precios vigente por fecha
  const rows = await db
    .select({
      productoId: cuadreItems.productoId,
      nombre: productos.nombre,
      gananciaTotal: sql<number>`
        sum(${cuadreItems.cantidad} * (${cuadreItems.precioVentaUsado} - ${historialPrecios.precioCompra}))
      `.as('ganancia_total')
    })
    .from(cuadreItems)
    .innerJoin(cuadres, eq(cuadres.id, cuadreItems.cuadreId))
    .innerJoin(productos, eq(productos.id, cuadreItems.productoId))
    .innerJoin(historialPrecios, and(
      eq(historialPrecios.productoId, productos.id),
      gte(cuadres.fecha, historialPrecios.vigenteDesde),
      sql`(${historialPrecios.vigenteHasta} IS NULL OR ${cuadres.fecha} < ${historialPrecios.vigenteHasta})`
    ))
    .where(and(...whereConditions))
    .groupBy(cuadreItems.productoId, productos.nombre)
    .orderBy(desc(sql`ganancia_total`))
    .limit(10)

  return rows.map(r => ({
    productoId: r.productoId,
    nombre: r.nombre,
    gananciaTotal: Number(r.gananciaTotal)
  }))
})
