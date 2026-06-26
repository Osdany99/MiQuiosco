import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems, cuadres, historialPrecios } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/regalos-descuentos-por-periodo?agrupacion=dia|mes&desde=&hasta=
 *
 * Cantidad y valor de líneas tipo regalo/descuento familiar por período.
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
  const agrupacion = (query.agrupacion as string) || 'dia'

  const whereConditions = [
    eq(cuadres.estado, 'cerrado')
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  let fechaFormat: string
  switch (agrupacion) {
    case 'mes': fechaFormat = '%Y-%m'
      break
    default: fechaFormat = '%Y-%m-%d'
  }

  const rows = await db
    .select({
      periodo: sql<string>`to_char(${cuadres.fecha}, ${fechaFormat})`.as('periodo'),
      valorRegalado: sql<number>`
        sum(
          case when ${cuadreItems.tipoLinea} = 'regalo'
          then ${cuadreItems.cantidad} * ${historialPrecios.precioVenta}
          else 0 end
        )
      `.as('valor_regalado'),
      valorDescontado: sql<number>`
        sum(
          case when ${cuadreItems.tipoLinea} = 'descuento_familiar'
          then ${cuadreItems.cantidad} * (${historialPrecios.precioVenta} - ${cuadreItems.precioVentaUsado})
          else 0 end
        )
      `.as('valor_descontado')
    })
    .from(cuadreItems)
    .innerJoin(cuadres, eq(cuadres.id, cuadreItems.cuadreId))
    .leftJoin(historialPrecios, and(
      eq(historialPrecios.productoId, cuadreItems.productoId),
      gte(cuadres.fecha, historialPrecios.vigenteDesde),
      sql`(${historialPrecios.vigenteHasta} IS NULL OR ${cuadres.fecha} < ${historialPrecios.vigenteHasta})`
    ))
    .where(and(...whereConditions))
    .groupBy(sql`periodo`)
    .orderBy(sql`periodo`)

  return rows.map(r => ({
    periodo: r.periodo,
    valorRegalado: Number(r.valorRegalado),
    valorDescontado: Number(r.valorDescontado)
  }))
})
