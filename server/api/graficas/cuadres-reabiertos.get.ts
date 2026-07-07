import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres, usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

/**
 * GET /api/graficas/cuadres-reabiertos?desde=&hasta=
 *
 * Historial de reaperturas con fechas.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado'),
    sql`${cuadres.reabiertoVeces} > 0`
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      fecha: cuadres.fecha,
      jefeId: cuadres.jefeId,
      reabiertoVeces: cuadres.reabiertoVeces,
      ultimaReaperturaEn: cuadres.ultimaReaperturaEn,
      jefeNombre: usuarios.nombre
    })
    .from(cuadres)
    .leftJoin(usuarios, eq(usuarios.id, cuadres.jefeId))
    .where(and(...whereConditions))
    .orderBy(desc(cuadres.ultimaReaperturaEn))

  return rows.map(r => ({
    fecha: r.fecha,
    jefeId: r.jefeId,
    jefeNombre: r.jefeNombre,
    reabiertoVeces: r.reabiertoVeces,
    ultimaReaperturaEn: r.ultimaReaperturaEn?.toISOString() ?? null
  }))
})
