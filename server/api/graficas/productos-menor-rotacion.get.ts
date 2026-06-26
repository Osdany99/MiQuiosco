import { eq, and, gte, lte, asc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems, cuadres, productos } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/productos-menor-rotacion?desde=&hasta=
 *
 * Productos activos con menos ventas en el período (incluye 0 ventas).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const auth = await requireAuth(event)
  if (auth.usuario.rol !== 'admin' && auth.usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado'),
    eq(productos.activo, true)
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      productoId: productos.id,
      nombre: productos.nombre,
      totalVendido: sql<number>`coalesce(sum(${cuadreItems.cantidad}), 0)`.as('total_vendido')
    })
    .from(productos)
    .leftJoin(cuadreItems, eq(cuadreItems.productoId, productos.id))
    .leftJoin(cuadres, and(
      eq(cuadres.id, cuadreItems.cuadreId),
      ...whereConditions.filter(c => c !== eq(productos.activo, true))
    ))
    .where(and(eq(productos.activo, true)))
    .groupBy(productos.id, productos.nombre)
    .orderBy(asc(sql`total_vendido`))
    .limit(10)

  return rows.map(r => ({
    productoId: r.productoId,
    nombre: r.nombre,
    totalVendido: Number(r.totalVendido)
  }))
})
