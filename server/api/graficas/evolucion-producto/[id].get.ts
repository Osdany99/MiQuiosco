import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../../database/client'
import { cuadreItems, cuadres } from '../../../database/schema'
import { requireRole, requireAuth } from '../../../utils/auth'

/**
 * GET /api/graficas/evolucion-producto/:id?desde=&hasta=
 *
 * Ventas diarias de un producto específico en el tiempo.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const auth = await requireAuth(event)
  if (auth.usuario.rol !== 'admin' && auth.usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID de producto requerido.' })
  }

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado'),
    eq(cuadreItems.productoId, id)
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      fecha: cuadres.fecha,
      cantidadVendida: sql<number>`sum(${cuadreItems.cantidad})`.as('cantidad_vendida')
    })
    .from(cuadreItems)
    .innerJoin(cuadres, eq(cuadres.id, cuadreItems.cuadreId))
    .where(and(...whereConditions))
    .groupBy(cuadres.fecha)
    .orderBy(cuadres.fecha)

  return rows.map(r => ({
    fecha: r.fecha,
    cantidadVendida: Number(r.cantidadVendida)
  }))
})
