import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../../../database/client'
import { cuadreItems, cuadres, productos } from '../../../database/schema'
import { requireRole, requireAuth } from '../../../utils/auth'

/**
 * GET /api/graficas/precio-usado-vs-oficial/:id?desde=&hasta=
 *
 * Comparativa del precio de venta usado en cuadre vs. precio oficial actual.
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
      precioVentaUsado: cuadreItems.precioVentaUsado,
      precioOficialActual: productos.precioVentaActual
    })
    .from(cuadreItems)
    .innerJoin(cuadres, eq(cuadres.id, cuadreItems.cuadreId))
    .innerJoin(productos, eq(productos.id, cuadreItems.productoId))
    .where(and(...whereConditions))
    .orderBy(cuadres.fecha)

  return rows.map(r => ({
    fecha: r.fecha,
    precioVentaUsado: Number(r.precioVentaUsado),
    precioOficialActual: Number(r.precioOficialActual)
  }))
})
