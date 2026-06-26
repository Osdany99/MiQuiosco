import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/ingresos-por-periodo?agrupacion=dia|semana|mes&desde=&hasta=
 *
 * Total de ventas (caja + transferencia + fiado) agrupado por día/semana/mes.
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
    case 'mes': fechaFormat = '%Y-%m'; break
    case 'semana': fechaFormat = '%Y-%W'; break
    default: fechaFormat = '%Y-%m-%d'
  }

  const rows = await db
    .select({
      periodo: sql<string>`to_char(${cuadres.fecha}, ${fechaFormat})`.as('periodo'),
      ingresoTotal: sql<number>`
        sum(${cuadres.totalRealCaja} + ${cuadres.montoTransferencia} + ${cuadres.montoFiado})
      `.as('ingreso_total')
    })
    .from(cuadres)
    .where(and(...whereConditions))
    .groupBy(sql`periodo`)
    .orderBy(sql`periodo`)

  return rows.map(r => ({
    periodo: r.periodo,
    ingresoTotal: Number(r.ingresoTotal)
  }))
})
