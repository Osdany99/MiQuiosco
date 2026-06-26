import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems, cuadres, productos } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/productos-mas-vendidos?desde=&hasta=
 *
 * Top 10 productos por cantidad total vendida.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  // También permitir jefe - verificar manualmente
  const auth = await requireAuth(event)
  if (auth.usuario.rol !== 'admin' && auth.usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado')
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      productoId: cuadreItems.productoId,
      nombre: productos.nombre,
      totalVendido: sql<number>`sum(${cuadreItems.cantidad})`.as('total_vendido')
    })
    .from(cuadreItems)
    .innerJoin(cuadres, eq(cuadres.id, cuadreItems.cuadreId))
    .innerJoin(productos, eq(productos.id, cuadreItems.productoId))
    .where(and(...whereConditions))
    .groupBy(cuadreItems.productoId, productos.nombre)
    .orderBy(desc(sql`total_vendido`))
    .limit(10)

  return rows.map(r => ({
    productoId: r.productoId,
    nombre: r.nombre,
    totalVendido: Number(r.totalVendido)
  }))
})
