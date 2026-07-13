import { and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string
  const agrupacion = (query.agrupacion as string) || 'dia'
  const whereConditions = [sql`${cuadres.estado} = 'cerrado'`]
  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))
  let fechaFormat: string
  switch (agrupacion) {
    case 'mes':
      fechaFormat = '%Y-%m'
      break
    case 'semana':
      fechaFormat = '%Y-%W'
      break
    default:
      fechaFormat = '%Y-%m-%d'
  }
  const rows = await db
    .select({
      periodo: sql<string>`to_char(${cuadres.fecha}, ${fechaFormat})`.as('periodo'),
      fiadoGenerado: sql<number>`coalesce(sum(${cuadres.montoFiado}), 0)`.as('fiado_generado'),
      fiadoCobrado: sql<number>`coalesce(sum(${cuadres.montoCobradoFiado}), 0)`.as('fiado_cobrado')
    })
    .from(cuadres)
    .where(and(...whereConditions))
    .groupBy(sql`periodo`)
    .orderBy(sql`periodo`)
  return rows.map(r => ({
    periodo: r.periodo,
    fiadoGenerado: Number(r.fiadoGenerado),
    fiadoCobrado: Number(r.fiadoCobrado)
  }))
})
